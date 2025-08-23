// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

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

function normInt(v){
  if (v === null || v === undefined || v === "") return null;
  const m = String(v).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}
const normName = (s) => String(s||"").trim().replace(/\s+/g," ");

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

async function list(sql){
  await ensureSchema(sql);
  return await sql`SELECT name, bike, sedan, suv FROM kleenkars_services ORDER BY name`;
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });

  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try{
    const sql = neon(process.env.DATABASE_URL);

    if (event.httpMethod === "GET") {
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "POST") {
      // Supports both create/update and rename update
      const body = JSON.parse(event.body || "{}");
      const originalName = normName(body.originalName || body.original_name || "");
      const name  = normName(body.name);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      await ensureSchema(sql);

      if (originalName && originalName !== name) {
        // Rename path: update the PK row with new name + prices
        const upd = await sql`
          UPDATE kleenkars_services
          SET name=${name}, bike=${bike}, sedan=${sedan}, suv=${suv}, updated_at=NOW()
          WHERE name=${originalName}
          RETURNING name
        `;
        if (!upd.length) {
          // If original not found, fallback to upsert on new name
          await sql`
            INSERT INTO kleenkars_services (name, bike, sedan, suv, updated_at)
            VALUES (${name}, ${bike}, ${sedan}, ${suv}, NOW())
            ON CONFLICT (name)
            DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
          `;
        }
      } else {
        // Normal upsert (create or overwrite same-name)
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, NOW())
          ON CONFLICT (name)
          DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
        `;
      }

      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const name = normName(body.name);
      if (!name) return err(400, "Missing service name");
      await ensureSchema(sql);
      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (!r.length) return err(404, "Service not found");
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
