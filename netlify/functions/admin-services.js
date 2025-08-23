// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

/* ------------------------------ helpers ------------------------------ */
const OK = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  },
  body: JSON.stringify(obj),
});
const ERR = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  },
  body: JSON.stringify({ ok: false, error: msg }),
});

function requireAuth(event) {
  const a = event.headers.authorization || event.headers.Authorization || "";
  return a.startsWith("Bearer ") && a.slice(7).trim();
}

function normInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const m = String(v).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------ schema ------------------------------ */
async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS kleenkars_services (
      name TEXT PRIMARY KEY,
      bike INT NULL,
      sedan INT NULL,
      suv INT NULL,
      position INT NULL,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  // Unique index on non-null positions
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS kleenkars_services_position_key
    ON kleenkars_services(position) WHERE position IS NOT NULL
  `;
}

/**
 * Renumber positions densely to 1..N using a single CTE — no temp tables.
 * This avoids transient UNIQUE conflicts on the partial unique index.
 */
async function normalizePositions(sql) {
  await sql`BEGIN`;
  try {
    // Clear positions first so nothing conflicts mid-update
    await sql`UPDATE kleenkars_services SET position = NULL WHERE position IS NOT NULL`;

    // Reassign dense positions ordered by old position then name
    await sql`
      WITH ranked AS (
        SELECT name, ROW_NUMBER() OVER (ORDER BY position NULLS LAST, name) AS rn
        FROM kleenkars_services
      )
      UPDATE kleenkars_services s
      SET position = r.rn, updated_at = NOW()
      FROM ranked r
      WHERE s.name = r.name
    `;

    await sql`COMMIT`;
  } catch (e) {
    await sql`ROLLBACK`;
    throw e;
  }
}

/* Seed sensible defaults once (only when table is empty) */
async function seedDefaultsIfEmpty(sql) {
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n > 0) return;
  await sql`
    INSERT INTO kleenkars_services (name, bike, sedan, suv, position, visible)
    VALUES
      ('Basic Wash',        50,  150, 200, 1, TRUE),
      ('Premium Car Wash',  NULL,200, 250, 2, TRUE),
      ('Detailing',         NULL,1500,2500,3, TRUE)
  `;
}

/* Ensure new items get a unique position at the end (1..N) */
async function ensurePosition(sql, name) {
  // If already has a position, leave it; else put at end
  const existing = await sql`SELECT position FROM kleenkars_services WHERE name=${name}`;
  if (existing.length && existing[0].position != null) return;

  const row = await sql`SELECT COALESCE(MAX(position),0)::int AS maxp FROM kleenkars_services`;
  const next = Number(row[0].maxp || 0) + 1;
  await sql`UPDATE kleenkars_services SET position=${next} WHERE name=${name}`;
}

/* Ordered list for UI */
async function list(sql, isPublic) {
  await ensureSchema(sql);
  await seedDefaultsIfEmpty(sql);

  const where = isPublic ? sql`WHERE visible IS TRUE` : sql``;
  return await sql`
    SELECT name, bike, sedan, suv, position, visible
    FROM kleenkars_services
    ${where}
    ORDER BY position NULLS LAST, name
  `;
}

/* Move a single service up/down or to a specific target position */
async function move(sql, name, direction, targetPos = null) {
  await ensureSchema(sql);

  const row = await sql`SELECT name, position FROM kleenkars_services WHERE name=${name}`;
  if (!row.length) throw new Error("Service not found");

  const cur = row[0].position;
  // Determine target
  if (direction === "set") {
    const t = Math.max(1, parseInt(targetPos, 10) || 1);
    await sql`BEGIN`;
    try {
      // Shift everything to make room
      await sql`UPDATE kleenkars_services SET position = position + 1 WHERE position >= ${t}`;
      await sql`UPDATE kleenkars_services SET position = ${t} WHERE name = ${name}`;
      await normalizePositions(sql);
      await sql`COMMIT`;
    } catch (e) {
      await sql`ROLLBACK`;
      throw e;
    }
    return;
  }

  // up/down: find neighbor and swap using a safe triple-step
  const neighbor = await sql`
    SELECT name, position
    FROM kleenkars_services
    WHERE position ${direction === "up" ? "<" : ">" } ${cur}
    ORDER BY position ${direction === "up" ? "DESC" : "ASC" }
    LIMIT 1
  `;
  if (!neighbor.length) return; // already at edge

  const other = neighbor[0];
  await sql`BEGIN`;
  try {
    await sql`UPDATE kleenkars_services SET position=NULL WHERE name=${name}`;
    await sql`UPDATE kleenkars_services SET position=${cur} WHERE name=${other.name}`;
    await sql`UPDATE kleenkars_services SET position=${other.position} WHERE name=${name}`;
    await sql`COMMIT`;
  } catch (e) {
    await sql`ROLLBACK`;
    // Last resort: normalize and rethrow
    await normalizePositions(sql);
    throw e;
  }
}

/* ------------------------------ handler ------------------------------ */
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return OK({ ok: true });

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Public read (no auth) when ?public=1 (used by index.html)
    const isPublicGet =
      event.httpMethod === "GET" &&
      (event.queryStringParameters?.public === "1" ||
        event.queryStringParameters?.public === "true");

    if (!isPublicGet) {
      // All non-public calls require auth
      if (!requireAuth(event)) return ERR(401, "Unauthorized");
    }

    /* -------- GET -------- */
    if (event.httpMethod === "GET") {
      const rows = await list(sql, isPublicGet);
      return OK({ ok: true, rows });
    }

    /* -------- POST: add/update (supports rename) --------
       Body: { originalName?, name, bike, sedan, suv, visible? }
    */
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const originalName = (body.originalName || body.name || "").toString().trim().slice(0, 100);
      const name = (body.name || "").toString().trim().slice(0, 100);
      if (!name) return ERR(400, "Missing service name");

      const bike = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv = normInt(body.suv);
      const visible = body.visible === undefined ? true : Boolean(body.visible);

      await ensureSchema(sql);

      // Rename if needed (preserve position & visibility)
      if (originalName && originalName !== name) {
        await sql`BEGIN`;
        try {
          const old = await sql`
            SELECT position, visible FROM kleenkars_services WHERE name=${originalName}
          `;
          let pos = null, vis = visible;
          if (old.length) { pos = old[0].position; vis = old[0].visible; }

          // Delete any existing row with target name to avoid PK collision when "renaming over"
          await sql`DELETE FROM kleenkars_services WHERE name=${name}`;

          // Upsert new row
          await sql`
            INSERT INTO kleenkars_services (name, bike, sedan, suv, position, visible, updated_at)
            VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${pos}, ${vis}, NOW())
            ON CONFLICT (name) DO UPDATE
            SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, visible=EXCLUDED.visible, updated_at=NOW()
          `;

          // Remove old name
          await sql`DELETE FROM kleenkars_services WHERE name=${originalName}`;
          // Ensure it has a position
          await ensurePosition(sql, name);
          await normalizePositions(sql);
          await sql`COMMIT`;
        } catch (e) {
          await sql`ROLLBACK`;
          throw e;
        }
      } else {
        // Regular upsert (add or update)
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, visible, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${visible}, NOW())
          ON CONFLICT (name) DO UPDATE
          SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, visible=EXCLUDED.visible, updated_at=NOW()
        `;
        await ensurePosition(sql, name);
        await normalizePositions(sql);
      }

      const rows = await list(sql, false);
      return OK({ ok: true, rows });
    }

    /* -------- PUT: toggle visibility --------
       Body: { name, visible:boolean }
    */
    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");
      const name = (body.name || "").toString().trim();
      if (!name) return ERR(400, "Missing service name");
      const visible = body.visible === undefined ? true : Boolean(body.visible);

      await ensureSchema(sql);
      const r = await sql`
        UPDATE kleenkars_services
        SET visible=${visible}, updated_at=NOW()
        WHERE name=${name}
        RETURNING name
      `;
      if (!r.length) return ERR(404, "Service not found");
      const rows = await list(sql, false);
      return OK({ ok: true, rows });
    }

    /* -------- PATCH: reorder --------
       Body: { name, direction: "up"|"down"|"set", target? }
    */
    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const name = (body.name || "").toString().trim();
      const direction = (body.direction || "").toString().trim();
      const target = body.target ?? null;
      if (!name || !direction) return ERR(400, "Missing name or direction");

      await move(sql, name, direction, target);
      await normalizePositions(sql);
      const rows = await list(sql, false);
      return OK({ ok: true, rows });
    }

    /* -------- DELETE --------
       Body: { name }
    */
    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const name = (body.name || "").toString().trim();
      if (!name) return ERR(400, "Missing service name");

      await ensureSchema(sql);
      const res = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (!res.length) return ERR(404, "Service not found");

      await normalizePositions(sql);
      const rows = await list(sql, false);
      return OK({ ok: true, rows });
    }

    return ERR(405, "Method Not Allowed");
  } catch (e) {
    console.error("admin-services", e);
    return ERR(500, e.message || String(e));
  }
}
