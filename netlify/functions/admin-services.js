// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, PATCH, DELETE, OPTIONS"
  },
  body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, PATCH, DELETE, OPTIONS"
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

async function ensureSchema(sql){
  await sql`
    CREATE TABLE IF NOT EXISTS kleenkars_services (
      name TEXT PRIMARY KEY,
      bike INT NULL,
      sedan INT NULL,
      suv INT NULL,
      position INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  // Make sure 'position' exists even on legacy tables
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS position INT NULL`;

  // Assign positions where missing (stable by existing position, then name)
  await sql`
    WITH ranked AS (
      SELECT name, COALESCE(position, ROW_NUMBER() OVER (ORDER BY position NULLS LAST, name)) AS rn
      FROM kleenkars_services
    )
    UPDATE kleenkars_services s
       SET position = r.rn
      FROM ranked r
     WHERE s.name = r.name AND s.position IS NULL
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
  if (!set.has("name")) return;

  const bikeCol   = ["bike","two_wheeler"].find(c => set.has(c));
  const sedanCol  = ["sedan","hatch","hatchback","hatch_sedan","hatchback_sedan","car"].find(c => set.has(c));
  const suvCol    = ["suv"].find(c => set.has(c));

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
    INSERT INTO kleenkars_services (name, bike, sedan, suv, position) VALUES
      ('Basic Wash', 50, 150, 200, 1),
      ('Premium Car Wash', NULL, 200, 250, 2),
      ('Detailing', NULL, 1500, 2500, 3)
  `;
}

async function list(sql){
  await ensureSchema(sql);
  await tryImportLegacy(sql);
  await seedDefaultsIfEmpty(sql);
  return await sql`SELECT name, bike, sedan, suv, position FROM kleenkars_services ORDER BY position ASC, name ASC`;
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });

  const sql = neon(process.env.DATABASE_URL);

  // Public read for customer page: ?public=1 (no auth)
  const isPublic = (event.queryStringParameters?.public ?? "") === "1";

  // For admin-only operations, enforce bearer token
  const needAuth = !isPublic || event.httpMethod !== "GET";
  if (needAuth) {
    const auth = event.headers.authorization || event.headers.Authorization || "";
    if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");
  }

  try{
    if (event.httpMethod === "GET") {
      const rows = await list(sql);
      // For public, just pass rows; admin page also consumes same shape
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const originalName = String(body.originalName || body.name || "").trim().slice(0,100);
      const name  = String(body.name||"").trim().slice(0,100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      await ensureSchema(sql);

      // If renaming, and originalName differs, delete/replace; else upsert by name
      if (originalName && originalName !== name) {
        // preserve position of original row if exists
        const posRow = (await sql`SELECT position FROM kleenkars_services WHERE name=${originalName}`)[0];
        const pos = posRow?.position ?? null;

        await sql`DELETE FROM kleenkars_services WHERE name=${originalName}`;

        const { maxpos } = (await sql`SELECT COALESCE(MAX(position),0)::int AS maxpos FROM kleenkars_services`)[0];
        const newPos = pos ?? (maxpos + 1);

        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${newPos}, NOW())
          ON CONFLICT (name)
          DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
        `;
      } else {
        // Upsert; if new row, push to end
        const { maxpos } = (await sql`SELECT COALESCE(MAX(position),0)::int AS maxpos FROM kleenkars_services`)[0];
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${maxpos + 1}, NOW())
          ON CONFLICT (name)
          DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
        `;
      }

      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "PATCH") {
      // Reorder: body { name, direction: "up" | "down" }
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name||"").trim();
      const direction = String(body.direction||"").trim().toLowerCase();
      if (!name || !["up","down"].includes(direction)) return err(400, "Bad request");

      await ensureSchema(sql);

      // Get current position
      const cur = (await sql`SELECT name, position FROM kleenkars_services WHERE name=${name}`)[0];
      if (!cur) return err(404, "Service not found");

      // Find neighbor
      let neighbor;
      if (direction === "up") {
        neighbor = (await sql`
          SELECT name, position FROM kleenkars_services
          WHERE position < ${cur.position}
          ORDER BY position DESC
          LIMIT 1
        `)[0];
      } else {
        neighbor = (await sql`
          SELECT name, position FROM kleenkars_services
          WHERE position > ${cur.position}
          ORDER BY position ASC
          LIMIT 1
        `)[0];
      }
      if (!neighbor) return ok({ ok:true, rows: await list(sql) }); // already at edge

      // Swap positions
      await sql`
        UPDATE kleenkars_services AS s
           SET position = CASE
                            WHEN s.name = ${cur.name} THEN ${neighbor.position}
                            WHEN s.name = ${neighbor.name} THEN ${cur.position}
                            ELSE s.position
                          END,
               updated_at = NOW()
         WHERE s.name IN (${cur.name}, ${neighbor.name})
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

      // Re-pack positions to keep sequence tight
      await sql`
        WITH ranked AS (
          SELECT name, ROW_NUMBER() OVER (ORDER BY position ASC, name ASC) AS rn
          FROM kleenkars_services
        )
        UPDATE kleenkars_services s
           SET position = r.rn
          FROM ranked r
         WHERE s.name = r.name
      `;

      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
