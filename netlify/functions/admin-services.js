// netlify/functions/admin-services.js
import { neon } from "@netlify/neon";

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  },
  body: JSON.stringify(obj),
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  },
  body: JSON.stringify({ ok: false, error: msg }),
});

function normInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const m = String(v).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS kleenkars_services (
      name TEXT PRIMARY KEY,
      bike INT NULL,
      sedan INT NULL,
      suv INT NULL,
      position INT UNIQUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name='kleenkars_services'
          AND column_name='position'
      ) THEN
        ALTER TABLE kleenkars_services ADD COLUMN position INT UNIQUE;
      END IF;
    END$$;
  `);
}

async function ensurePositions(sql) {
  await sql`UPDATE kleenkars_services SET position = NULL WHERE position IS NOT NULL AND position <= 0`;
  const rows = await sql`
    SELECT name, position
    FROM kleenkars_services
    ORDER BY position NULLS LAST, name ASC
  `;
  let pos = 1;
  for (const r of rows) {
    await sql`UPDATE kleenkars_services SET position = ${pos}, updated_at = NOW() WHERE name = ${r.name}`;
    pos++;
  }
}

async function seedDefaultsIfEmpty(sql) {
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n > 0) return;
  await sql`
    INSERT INTO kleenkars_services (name, bike, sedan, suv, position)
    VALUES
      ('Basic', 50, 150, 200, 1),
      ('Premium', NULL, 200, 250, 2),
      ('Detailing', NULL, 1500, 2500, 3)
  `;
}

async function tryImportLegacy(sql) {
  const legacy = await sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'services'
    LIMIT 1
  `;
  if (!legacy.length) return;

  const rows = await sql`SELECT * FROM services`;
  let pos = (await sql`SELECT COALESCE(MAX(position),0)::int AS p FROM kleenkars_services`)[0].p;
  for (const r of rows) {
    const name = String(r.name || "").trim().slice(0, 100) || null;
    if (!name) continue;
    const bike  = normInt(r.bike ?? r.two_wheeler);
    const sedan = normInt(r.sedan ?? r.hatch ?? r.hatchback ?? r.hatch_sedan ?? r.hatchback_sedan ?? r.car);
    const suv   = normInt(r.suv);
    pos++;
    await sql`
      INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
      VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${pos}, NOW())
      ON CONFLICT (name) DO NOTHING
    `;
  }
}

async function list(sql, includePosition = true) {
  await ensureSchema(sql);
  await seedDefaultsIfEmpty(sql);
  await ensurePositions(sql);
  const cols = includePosition ? "name, bike, sedan, suv, position" : "name, bike, sedan, suv";
  const rows = await sql(`SELECT ${cols} FROM kleenkars_services ORDER BY position ASC, name ASC`);
  return rows;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok({ ok: true });

  try {
    const sql = neon(process.env.DATABASE_URL);
    const qs = event.queryStringParameters || {};
    const isPublic = String(qs.public || "") === "1";

    if (event.httpMethod === "GET") {
      if (!isPublic) {
        const auth = event.headers.authorization || event.headers.Authorization || "";
        if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");
      }
      const rows = await list(sql, true);
      return ok({ ok: true, rows });
    }

    // Admin-only below
    const auth = event.headers.authorization || event.headers.Authorization || "";
    if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const originalName = String(body.originalName || "").trim();
      const name = String(body.name || "").trim().slice(0, 100);
      const bike  = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv   = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      await ensureSchema(sql);
      await seedDefaultsIfEmpty(sql);
      await ensurePositions(sql);

      if (originalName && originalName !== name) {
        const o = (await sql`SELECT position FROM kleenkars_services WHERE name=${originalName}`)[0];
        if (!o) return err(404, "Original service not found");
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${o.position}, NOW())
          ON CONFLICT (name)
          DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
        `;
        await sql`DELETE FROM kleenkars_services WHERE name=${originalName} AND name <> ${name}`;
      } else {
        const nextPos = (await sql`SELECT COALESCE(MAX(position),0)::int + 1 AS p FROM kleenkars_services`)[0].p;
        await sql`
          INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
          VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${nextPos}, NOW())
          ON CONFLICT (name)
          DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
        `;
      }

      const rows = await list(sql, true);
      return ok({ ok: true, rows });
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name || "").trim();
      const direction = (body.direction || "").toLowerCase();
      if (!name || !["up", "down"].includes(direction)) return err(400, "Provide name and direction 'up' or 'down'");

      await ensureSchema(sql);
      await ensurePositions(sql);

      const cur = (await sql`SELECT name, position FROM kleenkars_services WHERE name=${name}`)[0];
      if (!cur) return err(404, "Service not found");

      const op = direction === "up" ? "<" : ">";
      const order = direction === "up" ? "DESC" : "ASC";

      // IMPORTANT: build with $1 param, not template interpolation, to avoid "syntax error near $1"
      const neighborRows = await sql(
        `SELECT name, position
           FROM kleenkars_services
          WHERE position ${op} $1
          ORDER BY position ${order}
          LIMIT 1`,
        [cur.position]
      );
      const neighbor = neighborRows[0];
      if (!neighbor) return ok({ ok: true, rows: await list(sql, true) });

      // swap positions safely
      await sql`UPDATE kleenkars_services SET position = -1 WHERE name = ${name}`;
      await sql`UPDATE kleenkars_services SET position = ${cur.position} WHERE name = ${neighbor.name}`;
      await sql`UPDATE kleenkars_services SET position = ${neighbor.position} WHERE name = ${name}`;

      const rows = await list(sql, true);
      return ok({ ok: true, rows });
    }

    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name || "").trim();
      if (!name) return err(400, "Missing service name");

      await ensureSchema(sql);
      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");

      await ensurePositions(sql);
      const rows = await list(sql, true);
      return ok({ ok: true, rows });
    }

    return err(405, "Method Not Allowed");
  } catch (e) {
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
