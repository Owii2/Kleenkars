// netlify/functions/admin-services.js
import { neon } from "@netlify/neon";

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS"
  },
  body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS"
  },
  body: JSON.stringify({ ok:false, error: msg })
});

function requireAuth(event){
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  if (!/^Bearer\s+.+/i.test(h)) throw new Error("Unauthorized");
}

function normInt(v){
  if (v === null || v === undefined || v === "") return null;
  const m = String(v).match(/\d+/); // pulls 150 from "₹150", etc.
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

async function ensureSchema(sql){
  await sql`
    CREATE TABLE IF NOT EXISTS kleenkars_services (
      name TEXT PRIMARY KEY,
      bike INT NULL,
      sedan INT NULL,
      suv INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function handler(event){
  try{
    if (event.httpMethod === "OPTIONS") return ok({ ok:true });
    requireAuth(event);

    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    if (event.httpMethod === "GET") {
      const rows = await sql`SELECT name, bike, sedan, suv FROM kleenkars_services ORDER BY name`;
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "POST") {
      const b = JSON.parse(event.body || "{}");
      const name  = String(b.name||"").trim().slice(0,100);
      const bike  = normInt(b.bike);
      const sedan = normInt(b.sedan);
      const suv   = normInt(b.suv);
      if (!name) return err(400, "Missing service name");

      await sql`
        INSERT INTO kleenkars_services (name, bike, sedan, suv, updated_at)
        VALUES (${name}, ${bike}, ${sedan}, ${suv}, NOW())
        ON CONFLICT (name)
        DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
      `;
      const rows = await sql`SELECT name, bike, sedan, suv FROM kleenkars_services ORDER BY name`;
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "DELETE") {
      const b = JSON.parse(event.body || "{}");
      const name = String(b.name||"").trim();
      if (!name) return err(400, "Missing service name");

      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");

      const rows = await sql`SELECT name, bike, sedan, suv FROM kleenkars_services ORDER BY name`;
      return ok({ ok:true, rows });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    const code = /unauthorized/i.test(e.message) ? 401 : 500;
    return err(code, e.message || String(e));
  }
}
