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
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS kleenkars_services_position_key
    ON kleenkars_services(position) WHERE position IS NOT NULL
  `;
}

/* Seed once */
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

/* Dense 1..N positions — single UPDATE avoids unique conflicts */
async function normalizePositions(sql) {
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
}

/* Ensure a service sits at the end if it had no position */
async function ensurePosition(sql, name) {
  const existing = await sql`SELECT position FROM kleenkars_services WHERE name=${name}`;
  if (existing.length && existing[0].position != null) return;
  const row = await sql`SELECT COALESCE(MAX(position),0)::int AS maxp FROM kleenkars_services`;
  const next = Number(row[0].maxp || 0) + 1;
  await sql`UPDATE kleenkars_services SET position=${next}, updated_at=NOW() WHERE name=${name}`;
}

/* Ordered list for UI */
async function list(sql, isPublic) {
  await ensureSchema(sql);
  await seedDefaultsIfEmpty(sql);

  if (isPublic) {
    return await sql`
      SELECT name, bike, sedan, suv, position, visible
      FROM kleenkars_services
      WHERE visible IS TRUE
      ORDER BY position NULLS LAST, name
    `;
  } else {
    return await sql`
      SELECT name, bike, sedan, suv, position, visible
      FROM kleenkars_services
      ORDER BY position NULLS LAST, name
    `;
  }
}

/* Move up/down or set to a target position — no parameterized operators */
async function move(sql, name, direction, targetPos = null) {
  const row = await sql`SELECT name, position FROM kleenkars_services WHERE name=${name}`;
  if (!row.length) throw new Error("Service not found");
  const cur = row[0].position;

  if (direction === "set") {
    const t = Math.max(1, parseInt(targetPos, 10) || 1);
    await sql`BEGIN`;
    try {
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

  // Build two separate queries to avoid "$1" near ASC/DESC or < >
  let neighbor;
  if (direction === "up") {
    neighbor = await sql`
      SELECT name, position
      FROM kleenkars_services
      WHERE position < ${cur}
      ORDER BY position DESC
      LIMIT 1
    `;
  } else if (direction === "down") {
    neighbor = await sql`
      SELECT name, position
      FROM kleenkars_services
      WHERE position > ${cur}
      ORDER BY position ASC
      LIMIT 1
    `;
  } else {
    throw new Error("Invalid direction");
  }
  if (!neighbor.length) return;

  const other = neighbor[0];
  await sql`BEGIN`;
  try {
    // swap positions safely
    await sql`UPDATE kleenkars_services SET position=NULL WHERE name=${name}`;
    await sql`UPDATE kleenkars_services SET position=${cur} WHERE name=${other.name}`;
    await sql`UPDATE kleenkars_services SET position=${other.position} WHERE name=${name}`;
    await sql`COMMIT`;
  } catch (e) {
    await sql`ROLLBACK`;
    await normalizePositions(sql);
    throw e;
  }
}

/* ------------------------------ handler ------------------------------ */
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return OK({ ok: true });

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Public read for customer page
    const isPublicGet =
      event.httpMethod === "GET" &&
      (event.queryStringParameters?.public === "1" ||
        event.queryStringParameters?.public === "true");

    if (!isPublicGet) {
      if (!requireAuth(event)) return ERR(401, "Unauthorized");
    }

    /* GET */
    if (event.httpMethod === "GET") {
      const rows = await list(sql, isPublicGet);
      return OK({ ok: true, rows });
    }

    /* POST: add/update (supports rename via originalName) */
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

      if (originalName && originalName !== name) {
        await sql`BEGIN`;
        try {
          const old = await sql`
            SELECT position, visible FROM kleenkars_services WHERE name=${originalName}
          `;
          let pos = null, vis = visible;
          if (old.length) { pos = old[0].position; vis = old[0].visible; }

          await sql`DELETE FROM kleenkars_services WHERE name=${name}`;

          await sql`
            INSERT INTO kleenkars_services (name, bike, sedan, suv, position, visible, updated_at)
            VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${pos}, ${vis}, NOW())
            ON CONFLICT (name) DO UPDATE
            SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, visible=EXCLUDED.visible, updated_at=NOW()
          `;

          await sql`DELETE FROM kleenkars_services WHERE name=${originalName}`;
          await ensurePosition(sql, name);
          await normalizePositions(sql);
          await sql`COMMIT`;
        } catch (e) {
          await sql`ROLLBACK`;
          throw e;
        }
      } else {
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

    /* PUT: toggle visibility */
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

    /* PATCH: reorder (up|down|set) */
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

    /* DELETE */
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
