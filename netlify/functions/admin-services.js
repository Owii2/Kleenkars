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
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

async function ensureSchemaAndMaybeSeed(sql){
  // Create the new canonical table
  await sql`
    CREATE TABLE IF NOT EXISTS kleenkars_services (
      name TEXT PRIMARY KEY,
      bike INT NULL,
      sedan INT NULL,
      suv INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // If empty, try to import from legacy "services" table
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n > 0) return;

  const legacyExists = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'services'
    LIMIT 1
  `;
  if (legacyExists.length) {
    // Try columns: name, bike, sedan, suv (gracefully handle extras)
    const legacyCols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'services'
    `;
    const set = new Set(legacyCols.map(c => c.column_name));
    if (set.has("name")) {
      const rows = await sql`SELECT * FROM services`;
      for (const r of rows) {
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, updated_at)
          VALUES (${r.name}, ${r.bike ?? null}, ${r.sedan ?? null}, ${r.suv ?? null}, NOW())
          ON CONFLICT (name) DO UPDATE SET
            bike = EXCLUDED.bike,
            sedan = EXCLUDED.sedan,
            suv = EXCLUDED.suv,
            updated_at = NOW()
        `;
      }
    }
  }

  // If still empty, seed defaults you use on the site
  const { n: after } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (after === 0) {
    await sql`
      INSERT INTO kleenkars_services (name, bike, sedan, suv) VALUES
        ('Basic',     50,   150, 200),
        ('Premium',   NULL, 200, 250),
        ('Detailing', NULL, 1500, 2500)
    `;
  }
}

async function list(sql){
  await ensureSchemaAndMaybeSeed(sql);
  return await sql`SELECT name, bike, sedan, suv FROM kleenkars_services ORDER BY name`;
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });

  // Very simple auth gate (presence of Bearer). If you want strict JWT verify,
  // switch to the same verification used in admin-bookings/admin-login.
  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try{
    const sql = neon(process.env.DATABASE_URL);

    if (event.httpMethod === "GET") {
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const name  = String(body.name||"").trim().slice(0,100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      await ensureSchemaAndMaybeSeed(sql);
      await sql`
        INSERT INTO kleenkars_services (name, bike, sedan, suv, updated_at)
        VALUES (${name}, ${bike}, ${sedan}, ${suv}, NOW())
        ON CONFLICT (name)
        DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
      `;
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name||"").trim();
      if (!name) return err(400, "Missing service name");
      await ensureSchemaAndMaybeSeed(sql);
      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
