// netlify/functions/admin-bookings.js
import { neon, neonConfig } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  },
  body: JSON.stringify(obj),
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  },
  body: JSON.stringify({ ok: false, error: msg }),
});

function authz(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], process.env.ADMIN_JWT_SECRET); }
  catch { return null; }
}

const qsVal = (qs, k) => (qs?.[k] ?? "").toString().trim();

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok({ ok: true });
  if (!authz(event)) return err(401, "Unauthorized");

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Ensure canonical table (same schema used by saveBooking)
    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // ----- filters
    const qs = event.queryStringParameters || {};
    const from   = qsVal(qs, "from");   // YYYY-MM-DD
    const to     = qsVal(qs, "to");     // YYYY-MM-DD
    const svc    = qsVal(qs, "service");
    const search = qsVal(qs, "search");
    const limit  = Math.min(1000, Math.max(1, parseInt(qsVal(qs, "limit") || "500", 10)));

    const where = [];
    const params = [];

    if (from) { params.push(from); where.push(`(NULLIF(date,'')::date >= $${params.length}::date)`); }
    if (to)   { params.push(to);   where.push(`(NULLIF(date,'')::date <= $${params.length}::date)`); }
    if (svc)  { params.push(svc);  where.push(`service = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`); // name
      params.push(`%${search}%`); // phone
      where.push(`(name ILIKE $${params.length-1} OR phone ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    params.push(limit);
    const rows = await sql.query(
  `
  SELECT order_id, name, phone, vehicle, service,
         date, time, visit, address, price, created_at
  ${whereSql}
  LIMIT $1
  `,
  params
);
    return ok({ ok: true, rows });
  } catch (e) {
    console.error("admin-bookings", e);
    return err(500, e.message || String(e));
  }
}
