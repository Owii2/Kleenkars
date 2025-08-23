// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

/* -------------------- helpers for responses -------------------- */
const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
  },
  body: JSON.stringify(obj),
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
  },
  body: JSON.stringify({ ok: false, error: msg }),
});

const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

/* Parse "₹150", "150", "150 rs" → 150 (or null) */
function normInt(v) {
  if (isBlank(v)) return null;
  const m = String(v).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

/* -------------------- schema & utility queries -------------------- */
async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS kleenkars_services (
      name        TEXT PRIMARY KEY,
      bike        INT NULL,
      sedan       INT NULL,
      suv         INT NULL,
      position    INT UNIQUE,
      visible     BOOLEAN DEFAULT TRUE,
      description TEXT,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

async function nextPosition(sql) {
  const row = await sql`SELECT COALESCE(MAX(position), 0)::int AS m FROM kleenkars_services`;
  return (row[0]?.m || 0) + 1;
}

/* import rows from legacy “services” table if it exists (best-effort) */
async function tryImportLegacy(sql) {
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
  const set = new Set(cols.map((c) => c.column_name));
  if (!set.has("name")) return;

  const bikeCol = ["bike", "two_wheeler"].find((c) => set.has(c));
  const sedanCol = ["sedan", "hatch", "hatchback", "hatch_sedan", "hatchback_sedan", "car"].find((c) => set.has(c));
  const suvCol = ["suv"].find((c) => set.has(c));

  const rows = await sql`SELECT * FROM services`;
  let pos = await nextPosition(sql);
  for (const r of rows) {
    const name = String(r.name || "").trim().slice(0, 100);
    if (!name) continue;
    const bike = bikeCol ? normInt(r[bikeCol]) : null;
    const sedan = sedanCol ? normInt(r[sedanCol]) : null;
    const suv = suvCol ? normInt(r[suvCol]) : null;

    await sql`
      INSERT INTO kleenkars_services (name, bike, sedan, suv, position, visible, description, updated_at)
      VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${pos}, TRUE, NULL, NOW())
      ON CONFLICT (name) DO UPDATE SET
        bike = COALESCE(EXCLUDED.bike, kleenkars_services.bike),
        sedan = COALESCE(EXCLUDED.sedan, kleenkars_services.sedan),
        suv = COALESCE(EXCLUDED.suv, kleenkars_services.suv),
        updated_at = NOW()
    `;
    pos++;
  }
}

/* seed default 3 if table empty */
async function seedDefaultsIfEmpty(sql) {
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n > 0) return;
  const start = await nextPosition(sql);
  await sql`
    INSERT INTO kleenkars_services (name, bike, sedan, suv, position, visible, description)
    VALUES
      ('Basic Wash',       50,   150,  200, ${start + 0}, TRUE, 'Quick exterior wash'),
      ('Premium Car Wash', NULL, 200,  250, ${start + 1}, TRUE, 'Foam wash + wax'),
      ('Detailing',        NULL, 1500, 2500, ${start + 2}, TRUE, 'Full interior + exterior detail')
  `;
}

/* Return rows in display order */
async function list(sql, { publicOnly = false } = {}) {
  await ensureSchema(sql);
  await tryImportLegacy(sql);
  await seedDefaultsIfEmpty(sql);

  if (publicOnly) {
    return await sql`
      SELECT name, bike, sedan, suv, position, visible, description
      FROM kleenkars_services
      WHERE COALESCE(visible, TRUE) = TRUE
      ORDER BY position NULLS LAST, name
    `;
  }
  return await sql`
    SELECT name, bike, sedan, suv, position, visible, description
    FROM kleenkars_services
    ORDER BY position NULLS LAST, name
  `;
}

/* Swap positions between two rows safely (avoid unique conflict) */
async function swapPositions(sql, aName, aPos, bName, bPos) {
  // use a temporary -1 slot
  await sql`UPDATE kleenkars_services SET position = -1 WHERE name = ${aName}`;
  await sql`UPDATE kleenkars_services SET position = ${aPos} WHERE name = ${bName}`;
  await sql`UPDATE kleenkars_services SET position = ${bPos} WHERE name = ${aName}`;
}

/* -------------------- handler -------------------- */
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok({ ok: true });

  const auth = event.headers.authorization || event.headers.Authorization || "";
  const isPublic = (event.queryStringParameters || {}).public === "1";

  try {
    const sql = neon(process.env.DATABASE_URL);

    /* GET
       - if public=1 → return only visible services (no auth)
       - else requires auth and returns all services
    */
    if (event.httpMethod === "GET") {
      if (!isPublic) {
        if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");
      }
      const rows = await list(sql, { publicOnly: isPublic });
      return ok({ ok: true, rows });
    }

    /* All other methods require auth */
    if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

    /* POST — create or update (supports rename via originalName) */
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      const originalName = String(body.originalName || body.name || "").trim().slice(0, 100);
      const name = String(body.name || "").trim().slice(0, 100);
      if (!name) return err(400, "Missing service name");

      const bike = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv = normInt(body.suv);
      const visible = body.visible !== false; // default true
      const description = String(body.description || "").trim().slice(0, 1000);

      await ensureSchema(sql);

      // figure out the position to keep/use
      let pos = null;
      if (!isBlank(body.position)) {
        const p = parseInt(body.position, 10);
        if (Number.isFinite(p) && p > 0) pos = p;
      }

      // does the row exist (by originalName)?
      const existing = await sql`SELECT name, position FROM kleenkars_services WHERE name = ${originalName}`;
      if (existing.length) {
        // keep old position if not explicitly provided
        if (pos == null) pos = existing[0].position ?? (await nextPosition(sql));

        // if renaming, update PK
        if (name !== originalName) {
          // rename by updating PK + other fields
          await sql`
            UPDATE kleenkars_services
            SET name=${name}, bike=${bike}, sedan=${sedan}, suv=${suv},
                position=${pos}, visible=${visible}, description=${description}, updated_at=NOW()
            WHERE name=${originalName}
          `;
        } else {
          // upsert same name
          await sql`
            INSERT INTO kleenkars_services (name, bike, sedan, suv, position, visible, description, updated_at)
            VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${pos}, ${visible}, ${description}, NOW())
            ON CONFLICT (name) DO UPDATE SET
              bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv,
              position=EXCLUDED.position, visible=EXCLUDED.visible,
              description=EXCLUDED.description, updated_at=NOW()
          `;
        }
      } else {
        // new row
        if (pos == null) pos = await nextPosition(sql);
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, position, visible, description, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${pos}, ${visible}, ${description}, NOW())
          ON CONFLICT (name) DO UPDATE SET
            bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv,
            position=EXCLUDED.position, visible=EXCLUDED.visible,
            description=EXCLUDED.description, updated_at=NOW()
        `;
      }

      const rows = await list(sql);
      return ok({ ok: true, rows });
    }

    /* PATCH — reorder (move up/down) */
    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name || "").trim();
      const direction = String(body.direction || "").trim(); // 'up' | 'down'
      if (!name || !/(^up$|^down$)/i.test(direction)) return err(400, "Missing name or direction");

      await ensureSchema(sql);

      // ensure the row has a position
      let current = await sql`SELECT name, position FROM kleenkars_services WHERE name=${name}`;
      if (!current.length) return err(404, "Service not found");

      let curPos = current[0].position;
      if (curPos == null) {
        curPos = await nextPosition(sql);
        await sql`UPDATE kleenkars_services SET position=${curPos} WHERE name=${name}`;
      }

      // find neighbor
      let neighbor;
      if (direction.toLowerCase() === "up") {
        neighbor = await sql`
          SELECT name, position
          FROM kleenkars_services
          WHERE position < ${curPos}
          ORDER BY position DESC
          LIMIT 1
        `;
      } else {
        neighbor = await sql`
          SELECT name, position
          FROM kleenkars_services
          WHERE position > ${curPos}
          ORDER BY position ASC
          LIMIT 1
        `;
      }

      if (!neighbor.length) {
        const rows = await list(sql);
        return ok({ ok: true, rows }); // already at edge; nothing to do
      }

      const nbName = neighbor[0].name;
      const nbPos = neighbor[0].position;

      // swap positions safely
      await swapPositions(sql, name, nbPos, nbName, curPos);

      const rows = await list(sql);
      return ok({ ok: true, rows });
    }

    /* DELETE — remove by name */
    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name || "").trim();
      if (!name) return err(400, "Missing service name");
      await ensureSchema(sql);

      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");

      const rows = await list(sql);
      return ok({ ok: true, rows });
    }

    /* fallthrough */
    return err(405, "Method Not Allowed");
  } catch (e) {
    console.error("admin-services error:", e);
    // surface pg unique errors nicely
    if (String(e?.message || "").includes("kleenkars_services_position_key")) {
      return err(409, "Position conflict. Please try again.");
    }
    return err(500, e.message || String(e));
  }
}
