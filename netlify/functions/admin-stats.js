// netlify/functions/admin-stats.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" },
  body: JSON.stringify(obj),
});
const err = (code, msg) => ({
  statusCode: code,
  headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" },
  body: JSON.stringify({ ok:false, error: msg }),
});

export async function handler(event){
  if (event.httpMethod !== "GET") return err(405, "Method Not Allowed");
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try{
    const { group="month", from="", to="" } = event.queryStringParameters || {};
    const sql = neon(process.env.DATABASE_URL);

    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // date filter as ::date comparisons (date stored as TEXT YYYY-MM-DD)
    const where = [];
    if (from) where.push(`(NULLIF(date,'')::date >= ${sql(from)}::date)`);
    if (to) where.push(`(NULLIF(date,'')::date <= ${sql(to)}::date)`);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // grouping label
    let labelExpr = `to_char(NULLIF(date,'')::date, 'YYYY-MM')`;
    if (group === "year") labelExpr = `to_char(NULLIF(date,'')::date, 'YYYY')`;
    if (group === "day")  labelExpr = `to_char(NULLIF(date,'')::date, 'YYYY-MM-DD')`;

    const rows = await sql(`
      SELECT ${labelExpr} AS label, COALESCE(SUM(price),0)::int AS total
      FROM kleenkars_bookings
      ${whereSql}
      GROUP BY 1
      ORDER BY 1
    `);

    return ok({ ok:true, points: rows });
  }catch(e){
    console.error("admin-stats", e);
    return err(500, e.message);
  }
}
