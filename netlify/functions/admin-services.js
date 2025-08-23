// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const headersBase = {
  "Content-Type":"application/json",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, content-type",
  "Access-Control-Allow-Methods":"GET, POST, DELETE, OPTIONS",
  // Important: prevent browser/proxy caching so customer page sees fresh order immediately
  "Cache-Control":"no-store"
};
const ok = (obj) => ({ statusCode:200, headers:headersBase, body:JSON.stringify(obj) });
const err = (code, msg) => ({ statusCode:code, headers:headersBase, body:JSON.stringify({ ok:false, error:msg }) });

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
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS position INT NULL`;
  // Unique index for position to make swaps safe (NULL allowed, unique enforced only on non-null)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS kleenkars_services_position_idx ON kleenkars_services(position)`;

  // If table is empty, seed defaults
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n === 0){
    await sql`
      INSERT INTO kleenkars_services (name, bike, sedan, suv, position) VALUES
      ('Basic',     50, 150, 200, 1),
      ('Premium',   NULL, 200, 250, 2),
      ('Detailing', NULL, 1500, 2500, 3)
    `;
  }

  // Backfill positions for any rows missing it (append to end in name order)
  const { maxpos } = (await sql`SELECT COALESCE(MAX(position),0)::int AS maxpos FROM kleenkars_services`)[0];
  const nulls = await sql`SELECT name FROM kleenkars_services WHERE position IS NULL ORDER BY name`;
  let next = maxpos;
  for (const r of nulls){
    next += 1;
    await sql`UPDATE kleenkars_services SET position=${next} WHERE name=${r.name}`;
  }
}

async function listOrdered(sql){
  // Always return in the order admin set
  return await sql`
    SELECT name, bike, sedan, suv, position
    FROM kleenkars_services
    ORDER BY position NULLS LAST, name
  `;
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });

  try{
    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    const isPublic = (event.queryStringParameters || {}).public === "1";
    const auth = event.headers.authorization || event.headers.Authorization || "";

    // Auth is required unless public=1 on GET
    if (!isPublic){
      if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");
    }

    if (event.httpMethod === "GET"){
      const rows = await listOrdered(sql);
      return ok({ ok:true, rows, ts: Date.now() });
    }

    if (event.httpMethod === "POST"){
      const body = JSON.parse(event.body || "{}");

      // Reorder request
      if (body.action === "reorder"){
        const name = String(body.name||"").trim();
        const dir  = String(body.direction||"").trim(); // "up" | "down"
        if (!name || !/^(up|down)$/i.test(dir)) return err(400, "Bad reorder request");

        const rows = await listOrdered(sql);
        const i = rows.findIndex(r => r.name === name);
        if (i === -1) return err(404, "Service not found");
        const j = dir.toLowerCase() === "up" ? i-1 : i+1;
        if (j < 0 || j >= rows.length) {
          // nothing to swap (already at edge)
          const out = await listOrdered(sql);
          return ok({ ok:true, rows: out, ts: Date.now() });
        }

        // swap positions atomically
        await sql`BEGIN`;
        const posA = rows[i].position;
        const posB = rows[j].position;

        // If any side somehow has NULL, normalize it by pushing to end
        let A = posA, B = posB;
        if (A == null || B == null){
          const { maxpos } = (await sql`SELECT COALESCE(MAX(position),0)::int AS maxpos FROM kleenkars_services`)[0];
          if (A == null && B == null){
            await sql`UPDATE kleenkars_services SET position=${maxpos+1} WHERE name=${rows[i].name}`;
            await sql`UPDATE kleenkars_services SET position=${maxpos+2} WHERE name=${rows[j].name}`;
          } else if (A == null){
            await sql`UPDATE kleenkars_services SET position=${maxpos+1} WHERE name=${rows[i].name}`;
          } else if (B == null){
            await sql`UPDATE kleenkars_services SET position=${maxpos+1} WHERE name=${rows[j].name}`;
          }
        } else {
          // Normal swap
          await sql`UPDATE kleenkars_services SET position=${B} WHERE name=${rows[i].name}`;
          await sql`UPDATE kleenkars_services SET position=${A} WHERE name=${rows[j].name}`;
        }
        await sql`COMMIT`;

        const out = await listOrdered(sql);
        return ok({ ok:true, rows: out, ts: Date.now() });
      }

      // Save (create/update) request
      const name  = String(body.name||"").trim().slice(0,100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      // If exists, update; else insert at end
      const exists = await sql`SELECT position FROM kleenkars_services WHERE name=${name}`;
      if (exists.length){
        await sql`
          UPDATE kleenkars_services
          SET bike=${bike}, sedan=${sedan}, suv=${suv}, updated_at=NOW()
          WHERE name=${name}
        `;
      } else {
        const { maxpos } = (await sql`SELECT COALESCE(MAX(position),0)::int AS maxpos FROM kleenkars_services`)[0];
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${maxpos+1}, NOW())
        `;
      }
      const rows = await listOrdered(sql);
      return ok({ ok:true, rows, ts: Date.now() });
    }

    if (event.httpMethod === "DELETE"){
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name||"").trim();
      if (!name) return err(400, "Missing service name");

      await sql`BEGIN`;
      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING position`;
      if (r.length === 0){
        await sql`ROLLBACK`;
        return err(404, "Service not found");
      }
      // Compact positions so there are no gaps
      const rows = await listOrdered(sql);
      let pos = 0;
      for (const svc of rows){
        pos += 1;
        await sql`UPDATE kleenkars_services SET position=${pos} WHERE name=${svc.name}`;
      }
      await sql`COMMIT`;

      const out = await listOrdered(sql);
      return ok({ ok:true, rows: out, ts: Date.now() });
    }

    return err(405, "Method Not Allowed");
  }catch(e){
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
