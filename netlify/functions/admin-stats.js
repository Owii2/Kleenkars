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
    const group = (qs.group || "month").toLowerCase();  // day | month | year
    const from  = (qs.from  || "").trim();              // YYYY-MM-DD
    const to    = (qs.to    || "").trim();              // YYYY-MM-DD

    const GROUP_FMT = {
      day:   "YYYY-MM-DD",
      month: "YYYY-MM",
      year:  "YYYY",
    };
    const fmt = GROUP_FMT[group] || GROUP_FMT.month;

    const where = [];
    const p = [];

    // Filter on local date derived from timestamptz
    if (from) { p.push(from); where.push(`(datetime AT TIME ZONE 'Asia/Kolkata')::date >= $${p.length}::date`); }
    if (to)   { p.push(to);   where.push(`(datetime AT TIME ZONE 'Asia/Kolkata')::date <= $${p.length}::date`); }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // price fallback: parse first integer in service when price is NULL
    const q = `
      WITH base AS (
        SELECT
          (datetime AT TIME ZONE 'Asia/Kolkata') AS dt_local,
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
      SELECT
        to_char(dt_local, '${fmt}') AS label,
        SUM(price_int)::int AS total,
        COUNT(*)::int       AS count
      FROM base
      GROUP BY 1
      ORDER BY 1
    `;

    const rows = await sql(q, p);
    return json(200, { ok:true, points: rows });
  } catch (e) {
    return json(500, { ok:false, error: e.message });
  }
};
