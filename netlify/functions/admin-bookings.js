// netlify/functions/admin-bookings.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(obj),
});
const err = (code, message) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify({ ok: false, error: message }),
});

export async function handler(event) {
  if (event.httpMethod !== "GET") return err(405, "Method Not Allowed");

  // minimal token presence (you can upgrade later)
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try {
    const sql = neon(process.env.DATABASE_URL);

    // ensure table
    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const { from = "", to = "", service = "", search = "" } = event.queryStringParameters || {};

    // Build WHERE parts
    const where = [];
    if (from) where.push(`(NULLIF(date,'')::date >= ${sql(from)}::date)`);
    if (to) where.push(`(NULLIF(date,'')::date <= ${sql(to)}::date)`);
    if (service) where.push(`service = ${sql(service)}`);
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      where.push(`(LOWER(name) LIKE ${sql(q)} OR phone LIKE ${sql('%' + search.replace(/\D/g, '') + '%')})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await sql(
      `
      SELECT order_id, name, phone, vehicle, service, date, time, visit, address, price, created_at
      FROM kleenkars_bookings
      ${whereSql}
      ORDER BY created_at DESC
      `
    );

    return ok({ ok: true, rows });
  } catch (e) {
    console.error("admin-bookings", e);
    return err(500, e.message);
  }
}
