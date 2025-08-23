// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, DELETE, PATCH, PUT, OPTIONS"
  },
  body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, DELETE, PATCH, PUT, OPTIONS"
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
function normBool(v){
  if (v === null || v === undefined || v === "") return true;
  const s = String(v).trim().toLowerCase();
  if (["true","1","yes","y"].includes(s)) return true;
  if (["false","0","no","n"].includes(s)) return false;
  return true;
}
function trimOrNull(v, max=500){
  const s = String(v ?? "").trim();
  return s ? s.slice(0,max) : null;
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
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS visible BOOLEAN`;
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS description TEXT`;
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS position INT`;
  await sql`UPDATE kleenkars_services SET visible = true WHERE visible IS NULL`;
}

async function normalizePositions(sql){
  // Re-number to 1..N deterministically, avoiding unique-conflict mid-flight.
  await sql`BEGIN`;
  try{
    await sql`CREATE TEMP TABLE _rank AS
              SELECT name, ROW_NUMBER() OVER (ORDER BY position NULLS LAST, name) AS pos
              FROM kleenkars_services`;
    await sql`UPDATE kleenkars_services SET position = NULL WHERE position IS NOT NULL`;
    await sql`UPDATE kleenkars_services s
              SET position = r.pos, updated_at = NOW()
              FROM _rank r
              WHERE s.name = r.name`;
    await sql`DROP TABLE _rank`;
    // Ensure partial unique index exists after positions are normalized
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS kleenkars_services_position_key
      ON kleenkars_services(position) WHERE position IS NOT NULL
    `;
    await sql`COMMIT`;
  }catch(e){
    await sql`ROLLBACK`;
    throw e;
  }
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
      INSERT INTO kleenkars_services (name, bike, sedan, suv, visible, position, updated_at)
      VALUES (${name}, ${bike}, ${sedan}, ${suv}, true, NULL, NOW())
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
    INSERT INTO kleenkars_services (name, bike, sedan, suv, visible, position) VALUES
      ('Basic Wash', 50, 150, 200, true, 1),
      ('Premium Car Wash', NULL, 200, 250, true, 2),
      ('Detailing', NULL, 1500, 2500, true, 3)
  `;
}

async function list(sql, { publicOnly = false } = {}){
  await ensureSchema(sql);
  await tryImportLegacy(sql);
  await seedDefaultsIfEmpty(sql);
  await normalizePositions(sql);

  if (publicOnly){
    return await sql`
      SELECT name, bike, sedan, suv, description, position
      FROM kleenkars_services
      WHERE visible = true
      ORDER BY position, name
    `;
  }
  return await sql`
    SELECT name, bike, sedan, suv, visible, description, position
    FROM kleenkars_services
    ORDER BY position, name
  `;
}

function parseCsvLoose(text){
  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l=>l.trim()!=="");
  if (!lines.length) return { header:[], rows:[] };
  const parseLine = (line) => {
    const out = []; let cur = ""; let q = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (q){
        if (ch === '"'){
          if (line[i+1] === '"'){ cur+='"'; i++; }
          else { q=false; }
        } else cur+=ch;
      } else {
        if (ch === '"'){ q=true; }
        else if (ch === ','){ out.push(cur); cur=""; }
        else cur+=ch;
      }
    }
    out.push(cur);
    return out;
  };
  const header = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => parseLine(line));
  return { header, rows };
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });

  const sql = neon(process.env.DATABASE_URL);

  // PUBLIC (no auth): for index.html
  if (event.httpMethod === "GET" && (event.queryStringParameters?.public === "1")){
    try{
      const rows = await list(sql, { publicOnly: true });
      return ok({ ok:true, rows });
    }catch(e){
      console.error("admin-services public GET", e);
      return err(500, e.message || String(e));
    }
  }

  // ADMIN (auth required)
  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try{
    if (event.httpMethod === "GET") {
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "POST") {
      await ensureSchema(sql);
      const body = JSON.parse(event.body || "{}");
      const originalName = trimOrNull(body.originalName, 100);
      const name  = trimOrNull(body.name, 100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      const description = trimOrNull(body.description, 500);
      const visible = (body.visible === undefined) ? true : !!body.visible;

      if (!name) return err(400, "Missing service name");

      // Rename preserves position
      if (originalName && originalName !== name){
        await sql`UPDATE kleenkars_services SET name=${name}, updated_at=NOW() WHERE name=${originalName}`;
      }

      await sql`
        INSERT INTO kleenkars_services (name, bike, sedan, suv, description, visible, updated_at)
        VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${description}, ${visible}, NOW())
        ON CONFLICT (name)
        DO UPDATE SET
          bike        = EXCLUDED.bike,
          sedan       = EXCLUDED.sedan,
          suv         = EXCLUDED.suv,
          description = EXCLUDED.description,
          visible     = EXCLUDED.visible,
          updated_at  = NOW()
      `;

      // Clean positions
      await normalizePositions(sql);

      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "DELETE") {
      await ensureSchema(sql);
      const body = JSON.parse(event.body || "{}");
      const name = trimOrNull(body.name, 100);
      if (!name) return err(400, "Missing service name");
      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");

      await normalizePositions(sql);

      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    if (event.httpMethod === "PATCH") {
      await ensureSchema(sql);
      const body = JSON.parse(event.body || "{}");
      const name = trimOrNull(body.name, 100);
      const direction = String(body.direction||"");
      if(!name || !["up","down"].includes(direction)) return err(400, "Bad request");

      await sql`BEGIN`;
      try{
        const rows = await sql`
          SELECT name, position
          FROM kleenkars_services
          ORDER BY position NULLS LAST, name
        `;
        const idx = rows.findIndex(r=>r.name===name);
        if (idx === -1){
          await sql`ROLLBACK`;
          return err(404, "Not found");
        }

        const swapWith = direction === "up" ? idx-1 : idx+1;
        if (swapWith < 0 || swapWith >= rows.length){
          await sql`ROLLBACK`;
          return ok({ ok:true, rows: await list(sql) });
        }

        const a = rows[idx], b = rows[swapWith];

        // Make sure both have concrete positions
        const maxRow = (await sql`SELECT COALESCE(MAX(position),0)::int AS m FROM kleenkars_services`)[0];
        let curMax = maxRow?.m || 0;

        const posA = a.position ?? (++curMax);
        const posB = b.position ?? (++curMax);

        // Perform swap
        await sql`UPDATE kleenkars_services SET position=${posB}, updated_at=NOW() WHERE name=${a.name}`;
        await sql`UPDATE kleenkars_services SET position=${posA}, updated_at=NOW() WHERE name=${b.name}`;

        await sql`COMMIT`;
      }catch(e){
        await sql`ROLLBACK`;
        throw e;
      }

      await normalizePositions(sql);

      const out = await list(sql);
      return ok({ ok:true, rows: out });
    }

    if (event.httpMethod === "PUT") {
      // CSV import
      await ensureSchema(sql);
      const body = JSON.parse(event.body || "{}");
      const csv = String(body.csv || "");
      const mode = (body.mode || "upsert").toLowerCase();
      if (!csv.trim()) return err(400, "CSV is empty");

      const { header, rows } = parseCsvLoose(csv);
      const idx = (name) => header.indexOf(name);
      const ix = {
        name: idx("name"),
        bike: idx("bike"),
        sedan: idx("sedan"),
        suv: idx("suv"),
        visible: idx("visible"),
        description: idx("description"),
        position: idx("position")
      };
      if (ix.name < 0) return err(400, "CSV must include a 'name' column");

      if (mode === "replace"){
        await sql`DELETE FROM kleenkars_services`;
      }

      let imported = 0;
      for (const r of rows){
        const name = trimOrNull(r[ix.name], 100);
        if (!name) continue;
        const bike = ix.bike >= 0 ? normInt(r[ix.bike]) : null;
        const sedan = ix.sedan >= 0 ? normInt(r[ix.sedan]) : null;
        const suv = ix.suv >= 0 ? normInt(r[ix.suv]) : null;
        const visible = ix.visible >= 0 ? normBool(r[ix.visible]) : true;
        const description = ix.description >= 0 ? trimOrNull(r[ix.description], 500) : null;
        const position = ix.position >= 0 ? normInt(r[ix.position]) : null;

        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, visible, description, position, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${visible}, ${description}, ${position}, NOW())
          ON CONFLICT (name)
          DO UPDATE SET
            bike        = EXCLUDED.bike,
            sedan       = EXCLUDED.sedan,
            suv         = EXCLUDED.suv,
            visible     = EXCLUDED.visible,
            description = EXCLUDED.description,
            position    = COALESCE(EXCLUDED.position, kleenkars_services.position),
            updated_at  = NOW()
        `;
        imported++;
      }

      await normalizePositions(sql);

      const out = await list(sql);
      return ok({ ok:true, imported, rows: out });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
