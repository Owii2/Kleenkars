// netlify/functions/public-services.js
import { neon } from "@netlify/neon";

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, OPTIONS"
  },
  body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, OPTIONS"
  },
  body: JSON.stringify({ ok:false, error: msg })
});

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });
  if (event.httpMethod !== "GET") return err(405, "Method Not Allowed");

  try{
    const sql = neon(process.env.DATABASE_URL);

    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_services (
        name TEXT PRIMARY KEY,
        bike INT NULL,
        sedan INT NULL,
        suv INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const rows = await sql`
      SELECT name, bike, sedan, suv
      FROM kleenkars_services
      ORDER BY name
    `;

    // Build a friendly map: { [serviceName]: { Bike: price|null, "Hatch/Sedan": price|null, SUV: price|null } }
    const map = {};
    for (const r of rows){
      map[r.name] = {
        "Bike": r.bike === null ? null : Number(r.bike),
        "Hatch/Sedan": r.sedan === null ? null : Number(r.sedan),
        "SUV": r.suv === null ? null : Number(r.suv),
      };
    }

    return ok({ ok:true, services: rows, map });
  }catch(e){
    console.error("public-services", e);
    return err(500, e.message || String(e));
  }
}
