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
  try {
    const payload = jwt.verify(m[1], secret);
    return payload?.role === "admin" || payload?.role === "owner" ? payload : null;
  } catch {
    return null;
  }
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

    // --- Build WHERE for the selected window
    const where = [];
    const p = [];
    let fmt = "YYYY-MM";
    if (group === "day")   fmt = "YYYY-MM-DD";
    if (group === "year")  fmt = "YYYY";

    if (group === "day") {
      if (from) { p.push(from); where.push(`dt_local::date >= $${p.length}::date`); }
      if (to)   { p.push(to);   where.push(`dt_local::date <= $${p.length}::date`); }
    } else if (group === "month") {
      if (from) { p.push(from); where.push(`dt_local >= date_trunc('month', to_date($${p.length}, 'YYYY-MM'))`); }
      if (to)   { p.push(to);   where.push(`dt_local <  (date_trunc('month', to_date($${p.length}, 'YYYY-MM')) + INTERVAL '1 month')`); }
    } else if (group === "year") {
      if (from) { p.push(from); where.push(`dt_local >= make_date($${p.length}::int, 1, 1)`); }
      if (to)   { p.push(to);   where.push(`dt_local <  make_date(($${p.length}::int + 1), 1, 1)`); }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Base rows in window with safe price
    const baseBody = `
      SELECT
        CASE
          WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$' AND time ~ '^\\d{2}:\\d{2}$'
            THEN to_timestamp(date || ' ' || time, 'YYYY-MM-DD HH24:MI')
          WHEN date ~ '^\\d{4}-\\d{2}-\\d{2}$'
            THEN to_timestamp(date || ' 00:00', 'YYYY-MM-DD HH24:MI')
          ELSE NULL
        END AS dt_local,
        name, phone, vehicle, service,
        COALESCE(
          price,
          CASE WHEN service ~ '\\d'
               THEN NULLIF(regexp_replace(service, '.*?(\\d+).*', '\\1'), '')::int
               ELSE 0
          END
        ) AS price_int
      FROM kleenkars_bookings
    `;

    // 1) Trend points (grouped)
    const trendQ = `
      WITH base AS (${baseBody})
      SELECT to_char(dt_local, '${fmt}') AS label,
             SUM(price_int)::int AS total,
             COUNT(*)::int       AS count
      FROM base
      WHERE dt_local IS NOT NULL
      ${whereSql}
      GROUP BY 1
      ORDER BY 1
    `;
    const points = await sql.query(trendQ, p);

    // 2) Totals (for selected window)
    const totalsQ = `
      WITH base AS (${baseBody})
      SELECT COALESCE(SUM(price_int),0)::int AS total,
             COUNT(*)::int AS count
      FROM base
      WHERE dt_local IS NOT NULL
      ${whereSql}
    `;
    const totals = (await sql.query(totalsQ, p))[0] || { total: 0, count: 0 };
    const avg_ticket = totals.count ? Math.round(totals.total / totals.count) : 0;

    // 3) By service
    const byServiceQ = `
      WITH base AS (${baseBody})
      SELECT service AS label,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      WHERE dt_local IS NOT NULL
      ${whereSql}
      GROUP BY service
      ORDER BY total DESC NULLS LAST
      LIMIT 8
    `;
    const byService = await sql.query(byServiceQ, p);

    // 4) By vehicle
    const byVehicleQ = `
      WITH base AS (${baseBody})
      SELECT vehicle AS label,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      WHERE dt_local IS NOT NULL
      ${whereSql}
      GROUP BY vehicle
      ORDER BY total DESC NULLS LAST
    `;
    const byVehicle = await sql.query(byVehicleQ, p);

    // 5) Hour-of-day histogram (0..23)
    const byHourQ = `
      WITH base AS (${baseBody})
      SELECT EXTRACT(HOUR FROM dt_local)::int AS hour,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      WHERE dt_local IS NOT NULL
      ${whereSql}
      GROUP BY 1
      ORDER BY 1
    `;
    const byHour = await sql.query(byHourQ, p);

    // 6) Day-of-week histogram (0=Sunday..6=Saturday)
    const byDowQ = `
      WITH base AS (${baseBody})
      SELECT EXTRACT(DOW FROM dt_local)::int AS dow,
             SUM(price_int)::int AS total,
             COUNT(*)::int AS count
      FROM base
      WHERE dt_local IS NOT NULL
      ${whereSql}
      GROUP BY 1
      ORDER BY 1
    `;
    const byDow = await sql.query(byDowQ, p);

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
