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
  const m = String(v).match(/\d+/); // pulls 150 from "₹150", "150 rs"
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

/** Ensure table + position column + unique partial index, then backfill positions. */
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
  // Partial unique index so only non-null positions must be unique
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS kleenkars_services_position_key
    ON kleenkars_services (position) WHERE position IS NOT NULL
  `;

  // Backfill missing positions (stable order by updated_at, name)
  // Assign incremental positions starting after current MAX(position)
  const max = (await sql`SELECT COALESCE(MAX(position),0)::int AS max FROM kleenkars_services`)[0]?.max ?? 0;
  const nulls = await sql`SELECT name FROM kleenkars_services WHERE position IS NULL ORDER BY updated_at, name`;
  let pos = max;
  for (const r of nulls) {
    pos += 1;
    await sql`UPDATE kleenkars_services SET position=${pos}, updated_at=NOW() WHERE name=${r.name}`;
  }
}

async function seedDefaultsIfEmpty(sql){
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n > 0) return;
  // Seed with default positions 1..3
  await sql`
    INSERT INTO kleenkars_services (name, bike, sedan, suv, position)
    VALUES
      ('Basic Wash', 50, 150, 200, 1),
      ('Premium Car Wash', NULL, 200, 250, 2),
      ('Detailing', NULL, 1500, 2500, 3)
  `;
}

/** Return ordered list for admin or public. */
async function list(sql){
  await ensureSchema(sql);
  await seedDefaultsIfEmpty(sql);
  return await sql`
    SELECT name, bike, sedan, suv, position
    FROM kleenkars_services
    ORDER BY position ASC NULLS LAST, name ASC
  `;
}

/** Swap positions between two rows without violating the unique index. */
async function swapPositions(sql, aName, bName){
  // Use a temporary large value to free one side and avoid unique conflict
  const TEMP = 1000000000; // 1e9
  const a = (await sql`SELECT name, position FROM kleenkars_services WHERE name=${aName} LIMIT 1`)[0];
  const b = (await sql`SELECT name, position FROM kleenkars_services WHERE name=${bName} LIMIT 1`)[0];
  if (!a || !b) return;

  // 1) Move A to a temp position
  await sql`UPDATE kleenkars_services SET position=${TEMP} WHERE name=${a.name}`;
  // 2) Move B into A's old position
  await sql`UPDATE kleenkars_services SET position=${a.position} WHERE name=${b.name}`;
  // 3) Move A into B's old position
  await sql`UPDATE kleenkars_services SET position=${b.position} WHERE name=${a.name}`;
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });

  const isPublic = (event.queryStringParameters?.public === "1");
  const auth = event.headers.authorization || event.headers.Authorization || "";

  if (!isPublic) {
    if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");
  }

  try{
    const sql = neon(process.env.DATABASE_URL);

    // PUBLIC GET (no auth) for index.html
    if (isPublic && event.httpMethod === "GET") {
      const rows = await list(sql);
      // Only public fields
      return ok({ ok:true, rows: rows.map(r => ({
        name: r.name,
        bike: r.bike, sedan: r.sedan, suv: r.suv,
        position: r.position
      }))});
    }

    // AUTH GET (admin)
    if (event.httpMethod === "GET") {
      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    // AUTH POST (create/update; supports rename via originalName)
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const originalName = String(body.originalName || body.name || "").trim().slice(0,100);
      const name  = String(body.name||"").trim().slice(0,100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      await ensureSchema(sql);

      if (originalName && originalName !== name) {
        // Rename path: keep the same position
        const row = (await sql`SELECT position FROM kleenkars_services WHERE name=${originalName} LIMIT 1`)[0];
        if (row) {
          await sql`
            DELETE FROM kleenkars_services WHERE name=${name}
          `;
          await sql`
            UPDATE kleenkars_services
            SET name=${name}, bike=${bike}, sedan=${sedan}, suv=${suv}, updated_at=NOW()
            WHERE name=${originalName}
          `;
        } else {
          // original not found -> insert as new with max+1 position
          const max = (await sql`SELECT COALESCE(MAX(position),0)::int AS m FROM kleenkars_services`)[0].m;
          await sql`
            INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
            VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${max+1}, NOW())
          `;
        }
      } else {
        // Upsert by name; retain existing position if present
        const ex = (await sql`SELECT position FROM kleenkars_services WHERE name=${name} LIMIT 1`)[0];
        if (ex) {
          await sql`
            UPDATE kleenkars_services
            SET bike=${bike}, sedan=${sedan}, suv=${suv}, updated_at=NOW()
            WHERE name=${name}
          `;
        } else {
          const max = (await sql`SELECT COALESCE(MAX(position),0)::int AS m FROM kleenkars_services`)[0].m;
          await sql`
            INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
            VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${max+1}, NOW())
          `;
        }
      }

      const rows = await list(sql);
      return ok({ ok:true, rows });
    }

    // AUTH PATCH (reorder: { name, direction: "up"|"down" })
    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name||"").trim();
      const direction = String(body.direction||"").trim().toLowerCase();
      if (!name || !["up","down"].includes(direction)) return err(400, "Missing name/direction");

      await ensureSchema(sql);

      // Load all ordered rows
      const rows = await sql`
        SELECT name, position
        FROM kleenkars_services
        ORDER BY position ASC NULLS LAST, name ASC
      `;
      const idx = rows.findIndex(r => r.name === name);
      if (idx === -1) return err(404, "Service not found");
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= rows.length) {
        const list = await list(sql);
        return ok({ ok:true, rows: list }); // nothing to swap (top/bottom)
      }

      const a = rows[idx];
      const b = rows[targetIdx];

      // Swap positions safely using a temporary slot
      await swapPositions(sql, a.name, b.name);

      const listRows = await list(sql);
      return ok({ ok:true, rows: listRows });
    }

    // AUTH DELETE
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
