// netlify/functions/admin-stats.js
import { neon } from "@netlify/neon";
import jwt from "jsonwebtoken";

const json = (s, b) => ({
  statusCode: s,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  },
  body: JSON.stringify(b),
});

const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} missing`); return v; };
const authz = (event, secret) => {
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], secret); } catch { return null; }
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "GET")     return json(405, { ok:false, error:"Method not allowed" });

  try {
    const SECRET = need("ADMIN_JWT_SECRET");
    const DBURL  = need("DATABASE_URL");
    if (!authz(event, SECRET)) return json(401, { ok:false, error:"Unauthorized" });

    const sql = neon(DBURL);

    // Inputs
    const qs = event.queryStringParameters || {};
    const group = (qs.group || "month").toLowerCase();  // "day" | "month" | "year"
    const from  = (qs.from  || "").trim();              // day: YYYY-MM-DD | month: YYYY-MM | year: YYYY
    const to    = (qs.to    || "").trim();

    // --- Build WHERE for the selected window (Asia/Kolkata local time)
    const where = [];
    const p = [];
    let fmt = "YYYY-MM";
    if (group === "day")   fmt = "YYYY-MM-DD";
    if (group === "year")  fmt = "YYYY";

    if (group === "day") {
      if (from) { p.push(from); where.push(`(datetime AT TIME ZONE 'Asia/Kolkata')::date >= $${p.length}::date`); }
      if (to)   { p.push(to);   where.push(`(datetime AT TIME ZONE 'Asia/Kolkata')::date <= $${p.length}::date`); }
    } else if (group === "month") {
      if (from) { p.push(from); where.push(`(datetime AT TIME ZONE 'Asia/Kolkata') >= date_trunc('month', to_date($${p.length}, 'YYYY-MM'))`); }
      if (to)   { p.push(to);   where.push(`(datetime AT TIME ZONE 'Asia/Kolkata') <  (date_trunc('month', to_date($${p.length}, 'YYYY-MM')) + INTERVAL '1 month')`); }
    } else if (group === "year") {
      if (from) { p.push(from); where.push(`(datetime AT TIME ZONE 'Asia/Kolkata') >= make_date($${p.length}::int, 1, 1)`); }
      if (to)   { p.push(to);   where.push(`(datetime AT TIME ZONE 'Asia/Kolkata') <  make_date(($${p.length}::int + 1), 1, 1)`); }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Base rows in window with safe price
    const base = `
      WITH base AS (
        SELECT
          (datetime AT TIME ZONE 'Asia/Kolkata') AS dt_local,
          name, phone, vehicle, service,
          COALESCE(
            price,
            CASE WHEN service ~ '\\d'
                 THEN NULLIF(regexp_replace(service, '.*?(\\d+).*', '\\1'), '')::int
                 ELSE 0
            END
          ) AS price_int
        FROM bookings
        ${whereSql}
      )
    `;

    // 1) Trend points (grouped)
    const trendQ = `
      ${base}
      SELECT to_char(dt_local, '${fmt}') AS label,
             SUM(price_int)::int AS total,
             COUNT(*)::int       AS count
      FROM base
      GROUP BY 1
      ORDER BY 1
    `;
    const points = await sql(trendQ, p);

    // 2) Totals (for selected window)
    const totalsQ = `
      ${base}
      SELECT COALESCE(SUM(price_int),0)::int AS total,
             COUNT(*)::int AS count
      FROM base
    `;
    const totals = (await sql(totalsQ, p))[0] || { total: 0, count: 0 };
    const avg_ticket = totals.count ? Math.round(totals.total / totals.count) : 0;

    // 3) By service
    const byServiceQ = `
      ${base}
      SELECT service AS label,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      GROUP BY service
      ORDER BY total DESC NULLS LAST
      LIMIT 8
    `;
    const byService = await sql(byServiceQ, p);

    // 4) By vehicle
    const byVehicleQ = `
      ${base}
      SELECT vehicle AS label,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      GROUP BY vehicle
      ORDER BY total DESC NULLS LAST
    `;
    const byVehicle = await sql(byVehicleQ, p);

    // 5) Hour-of-day histogram (0..23)
    const byHourQ = `
      ${base}
      SELECT EXTRACT(HOUR FROM dt_local)::int AS hour,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      GROUP BY 1
      ORDER BY 1
    `;
    const byHour = await sql(byHourQ, p);

    // 6) Day-of-week histogram (0=Sunday..6=Saturday)
    const byDowQ = `
      ${base}
      SELECT EXTRACT(DOW FROM dt_local)::int AS dow,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      GROUP BY 1
      ORDER BY 1
    `;
    const byDow = await sql(byDowQ, p);

    return json(200, {
      ok: true,
      group, from, to,
      totals: { total: totals.total, count: totals.count, avg_ticket },
      points,
      byService,
      byVehicle,
      byHour,
      byDow
    });
  } catch (e) {
    return json(500, { ok:false, error: e.message });
  }
};
