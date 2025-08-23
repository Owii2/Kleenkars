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
  const m = String(v).match(/\d+/); // pulls 150 from "₹150" etc.
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

async function tryImportLegacy(sql){
  const legacy = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'services'
    LIMIT 1
  `;
  if (!legacy.length) return;

  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'services'
  `;
  const set = new Set(cols.map(c => c.column_name));

  const bikeCol   = ["bike","two_wheeler"].find(c => set.has(c));
  const sedanCol  = ["sedan","hatch","hatchback","hatch_sedan","hatchback_sedan","car"].find(c => set.has(c));
  const suvCol    = ["suv"].find(c => set.has(c));

  if (!set.has("name")) return;

  const rows = await sql`SELECT * FROM services`;
  for (const r of rows) {
    const name  = String(r.name || "").trim().slice(0,100);
    const bike  = bikeCol  ? normInt(r[bikeCol])   : null;
    const sedan = sedanCol ? normInt(r[sedanCol])  : null;
    const suv   = suvCol   ? normInt(r[suvCol])    : null;

    await sql`
      INSERT INTO kleenkars_services (name, bike, sedan, suv, updated_at)
      VALUES (${name}, ${bike}, ${sedan}, ${suv}, NOW())
      ON CONFLICT (name) DO UPDATE SET
        bike = COALESCE(EXCLUDED.bike, kleenkars_services.bike),
        sedan = COALESCE(EXCLUDED.sedan, kleenkars_services.sedan),
        suv = COALESCE(EXCLUDED.suv, kleenkars_services.suv),
        updated_at = NOW()
    `;
  }
}

async function seedDefaultsIfEmpty(sql){
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n > 0) return;
  await sql`
    INSERT INTO kleenkars_services (name, bike, sedan, suv) VALUES
      ('Basic Wash', 50, 150, 200),
      ('Premium Car Wash', NULL, 200, 250),
      ('Detailing', NULL, 1500, 2500)
  `;
}

/** Fill prices for rows whose name *contains* the expected keywords but prices are null */
async function repairByKeywords(sql){
  // Load all rows
  const rows = await sql`SELECT name, bike, sedan, suv FROM kleenkars_services`;
  for (const r of rows) {
    const name = (r.name || "").toLowerCase();

    // Ignore rows that already have any price set
    const hasAny = [r.bike, r.sedan, r.suv].some(v => v !== null && v !== undefined);

    if (!hasAny) {
      if (name.includes("detail")) {
        await sql`UPDATE kleenkars_services SET bike=NULL, sedan=1500, suv=2500, updated_at=NOW() WHERE name=${r.name}`;
      } else if (name.includes("premium")) {
        await sql`UPDATE kleenkars_services SET bike=NULL, sedan=200, suv=250, updated_at=NOW() WHERE name=${r.name}`;
      } else if (name.includes("basic")) {
        // Basic applies to Bike, Hatch/Sedan, SUV
        await sql`UPDATE kleenkars_services SET bike=50, sedan=150, suv=200, updated_at=NOW() WHERE name=${r.name}`;
      }
    }
  }
}

async function list(sql){
  await ensureSchema(sql);
  await tryImportLegacy(sql);
  await seedDefaultsIfEmpty(sql);
  await repairByKeywords(sql);
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
      const body = JSON.parse(event.body || "{}");
      const name  = String(body.name||"").trim().slice(0,100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      await ensureSchema(sql);
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
      await ensureSchema(sql);
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
