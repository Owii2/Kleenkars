// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200, headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" }, body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code, headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" }, body: JSON.stringify({ ok:false, error: msg })
});

export async function handler(event){
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

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

    if (event.httpMethod === "GET") {
      const rows = await sql`SELECT name, bike, sedan, suv FROM kleenkars_services ORDER BY name`;
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const name  = String(body.name||"").trim().slice(0,100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      await sql`
        INSERT INTO kleenkars_services (name, bike, sedan, suv, updated_at)
        VALUES (${name}, ${bike}, ${sedan}, ${suv}, NOW())
        ON CONFLICT (name)
        DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
      `;
      return ok({ ok:true });
    }

    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name||"").trim();
      if (!name) return err(400, "Missing service name");
      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");
      return ok({ ok:true });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    console.error("admin-services", e);
    return err(500, e.message);
  }
}

function normInt(v){
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
