// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, DELETE, PATCH, OPTIONS"
  },
  body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"GET, POST, DELETE, PATCH, OPTIONS"
  },
  body: JSON.stringify({ ok:false, error: msg })
});

const ADMIN_METHODS = new Set(["POST","DELETE","PATCH"]);

/* ---------- utils ---------- */
function needAuth(event){
  const isPublicGet = event.httpMethod === "GET" &&
                      (event.queryStringParameters?.public === "1");
  return !isPublicGet;
}
function authorize(event){
  const auth = event.headers.authorization || event.headers.Authorization || "";
  return auth.startsWith("Bearer ") && !!auth.slice(7).trim();
}
function normInt(v){
  if (v === null || v === undefined || v === "") return null;
  const m = String(v).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}
function normBool(v, fallback=true){
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase().trim();
  if (["1","true","yes","y","on"].includes(s)) return true;
  if (["0","false","no","n","off"].includes(s)) return false;
  return fallback;
}
function normText(v, max=400){
  return String(v ?? "").trim().slice(0,max);
}

/* ---------- schema helpers ---------- */
async function ensureSchema(sql){
  // base table
  await sql`
    CREATE TABLE IF NOT EXISTS kleenkars_services (
      name TEXT PRIMARY KEY,
      bike INT NULL,
      sedan INT NULL,
      suv INT NULL,
      position INT UNIQUE,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      description TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  // add columns if missing
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS position INT`;
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
}

async function normalizePositions(sql){
  // order existing rows with NULLs last
  const rows = await sql`
    SELECT name, position
    FROM kleenkars_services
    ORDER BY position NULLS LAST, name
  `;
  let pos = 1;
  for (const r of rows) {
    if (r.position !== pos) {
      await sql`UPDATE kleenkars_services SET position=${pos}, updated_at=NOW() WHERE name=${r.name}`;
    }
    pos++;
  }
}

async function ensurePosition(sql, name){
  const [{ cnt }] = await sql`SELECT COUNT(*)::int AS cnt FROM kleenkars_services WHERE position IS NULL OR position<=0`;
  if (cnt > 0) await normalizePositions(sql);

  const found = await sql`SELECT position FROM kleenkars_services WHERE name=${name}`;
  if (found.length === 0) return;
  if (found[0].position == null || found[0].position <= 0){
    const [{ mx }] = await sql`SELECT COALESCE(MAX(position),0)::int AS mx FROM kleenkars_services`;
    const next = (mx || 0) + 1;
    await sql`UPDATE kleenkars_services SET position=${next}, updated_at=NOW() WHERE name=${name}`;
  }
}

/* ---------- list helpers ---------- */
async function list(sql, { publicOnly=false } = {}){
  await ensureSchema(sql);
  await normalizePositions(sql);

  if (publicOnly){
    return await sql`
      SELECT name, bike, sedan, suv, position, visible, description
      FROM kleenkars_services
      WHERE visible = TRUE
      ORDER BY position ASC, name ASC
    `;
  } else {
    return await sql`
      SELECT name, bike, sedan, suv, position, visible, description
      FROM kleenkars_services
      ORDER BY position ASC, name ASC
    `;
  }
}

/* ---------- handler ---------- */
export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });

  try{
    if (needAuth(event) && !authorize(event)) return err(401, "Unauthorized");

    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    // PUBLIC GET for index.html
    if (event.httpMethod === "GET"){
      const publicOnly = event.queryStringParameters?.public === "1";
      const rows = await list(sql, { publicOnly });
      return ok({ ok:true, rows });
    }

    // ADMIN: create/update (upsert + optional rename)
    if (event.httpMethod === "POST"){
      const body = JSON.parse(event.body || "{}");
      const originalName = normText(body.originalName || body.name, 100);
      const name  = normText(body.name, 100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      const visible = normBool(body.visible, true);
      const description = normText(body.description, 1000);

      if (!name) return err(400, "Missing service name");

      // If renaming, try to update the PK row directly
      if (originalName && originalName !== name){
        const r = await sql`
          UPDATE kleenkars_services
             SET name=${name},
                 bike=${bike},
                 sedan=${sedan},
                 suv=${suv},
                 visible=${visible},
                 description=${description},
                 updated_at=NOW()
           WHERE name=${originalName}
           RETURNING position
        `;
        if (r.length){
          await ensurePosition(sql, name);
          const rows = await list(sql);
          return ok({ ok:true, rows });
        }
        // fall through to upsert if original not found
      }

      // upsert (keeps existing position; sets new to tail)
      await sql`
        INSERT INTO kleenkars_services (name, bike, sedan, suv, visible, description, updated_at)
        VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${visible}, ${description}, NOW())
        ON CONFLICT (name) DO UPDATE SET
          bike=EXCLUDED.bike,
          sedan=EXCLUDED.sedan,
          suv=EXCLUDED.suv,
          visible=EXCLUDED.visible,
          description=EXCLUDED.description,
          updated_at=NOW()
      `;

      await ensurePosition(sql, name);
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    // ADMIN: delete
    if (event.httpMethod === "DELETE"){
      const body = JSON.parse(event.body || "{}");
      const name = normText(body.name, 100);
      if (!name) return err(400, "Missing service name");

      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");

      await normalizePositions(sql);
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    // ADMIN: reorder (direction = "up"|"down")
    if (event.httpMethod === "PATCH"){
      const body = JSON.parse(event.body || "{}");
      const name = normText(body.name, 100);
      const direction = (body.direction || "").toString();

      if (!name) return err(400, "Missing service name");
      if (!["up","down"].includes(direction)) return err(400, "Invalid direction");

      // get ordered list
      const rows = await sql`
        SELECT name, position
        FROM kleenkars_services
        ORDER BY position ASC, name ASC
      `;
      const idx = rows.findIndex(r => r.name === name);
      if (idx === -1) return err(404, "Service not found");

      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= rows.length){
        // edge; nothing to do
        const after = await list(sql);
        return ok({ ok:true, rows: after });
      }

      const a = rows[idx];
      const b = rows[swapIdx];

      // safe swap in a small transaction using a temporary position
      await sql`BEGIN`;
      try{
        // use a temporary negative value to avoid unique collision
        await sql`UPDATE kleenkars_services SET position = ${-a.position} WHERE name=${a.name}`;
        await sql`UPDATE kleenkars_services SET position = ${a.position}   WHERE name=${b.name}`;
        await sql`UPDATE kleenkars_services SET position = ${b.position}   WHERE name=${a.name}`;
        await sql`COMMIT`;
      }catch(e){
        await sql`ROLLBACK`;
        throw e;
      }

      await normalizePositions(sql);
      const out = await list(sql);
      return ok({ ok:true, rows: out });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
