// netlify/functions/admin-services.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
  },
  body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
  },
  body: JSON.stringify({ ok: false, error: msg })
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

  // add position column if missing
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'kleenkars_services'
  `;
  const hasPosition = cols.some(c => c.column_name === "position");
  if (!hasPosition) {
    await sql`ALTER TABLE kleenkars_services ADD COLUMN position INT UNIQUE`;
  }
}

async function compactPositions(sql) {
  const rows = await sql`SELECT name FROM kleenkars_services ORDER BY position NULLS LAST, name`;
  let pos = 1;
  for (const r of rows) {
    await sql`UPDATE kleenkars_services SET position=${pos++} WHERE name=${r.name}`;
  }
}

async function seedDefaultsIfEmpty(sql) {
  const { n } = (await sql`SELECT COUNT(*)::int AS n FROM kleenkars_services`)[0];
  if (n > 0) return;
  await sql`
    INSERT INTO kleenkars_services (name, bike, sedan, suv, position) VALUES
      ('Basic Wash', 50, 150, 200, 1),
      ('Premium Car Wash', NULL, 200, 250, 2),
      ('Detailing', NULL, 1500, 2500, 3)
  `;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok({ ok: true });

  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try {
    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    if (event.httpMethod === "GET") {
      await seedDefaultsIfEmpty(sql);
      await compactPositions(sql);
      const rows = await sql`SELECT name, bike, sedan, suv, position FROM kleenkars_services ORDER BY position`;
      return ok({ ok: true, rows });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const originalName = String(body.originalName || body.name || "").trim();
      const name = String(body.name || "").trim().slice(0, 100);
      const bike = normInt(body.bike);
      const sedan = normInt(body.sedan);
      const suv = normInt(body.suv);
      if (!name) return err(400, "Missing service name");

      if (originalName && originalName !== name) {
        // rename
        await sql`DELETE FROM kleenkars_services WHERE name=${originalName}`;
      }

      // if inserting new, assign next position
      let pos = body.position;
      if (!pos) {
        const { max } = (await sql`SELECT COALESCE(MAX(position),0)+1 AS max FROM kleenkars_services`)[0];
        pos = max;
      }

      await sql`
        INSERT INTO kleenkars_services (name, bike, sedan, suv, position, updated_at)
        VALUES (${name}, ${bike}, ${sedan}, ${suv}, ${pos}, NOW())
        ON CONFLICT (name)
        DO UPDATE SET bike=EXCLUDED.bike, sedan=EXCLUDED.sedan, suv=EXCLUDED.suv, updated_at=NOW()
      `;
      await compactPositions(sql);
      const rows = await sql`SELECT name, bike, sedan, suv, position FROM kleenkars_services ORDER BY position`;
      return ok({ ok: true, rows });
    }

    if (event.httpMethod === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name || "").trim();
      const direction = String(body.direction || "").trim();
      if (!name || !["up", "down"].includes(direction)) return err(400, "Invalid request");

      const rows = await sql`SELECT name, position FROM kleenkars_services ORDER BY position`;
      const idx = rows.findIndex(r => r.name === name);
      if (idx < 0) return err(404, "Service not found");

      const swapWith = direction === "up" ? rows[idx - 1] : rows[idx + 1];
      if (!swapWith) return ok({ ok: true }); // no move possible

      // swap safely
      await sql`UPDATE kleenkars_services SET position=NULL WHERE name=${name}`;
      await sql`UPDATE kleenkars_services SET position=${rows[idx].position} WHERE name=${swapWith.name}`;
      await sql`UPDATE kleenkars_services SET position=${swapWith.position} WHERE name=${name}`;

      const newRows = await sql`SELECT name, bike, sedan, suv, position FROM kleenkars_services ORDER BY position`;
      return ok({ ok: true, rows: newRows });
    }

    if (event.httpMethod === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const name = String(body.name || "").trim();
      if (!name) return err(400, "Missing service name");

      const r = await sql`DELETE FROM kleenkars_services WHERE name=${name} RETURNING name`;
      if (r.length === 0) return err(404, "Service not found");

      await compactPositions(sql);
      const rows = await sql`SELECT name, bike, sedan, suv, position FROM kleenkars_services ORDER BY position`;
      return ok({ ok: true, rows });
    }

    return err(405, "Method Not Allowed");
  } catch (e) {
    console.error("admin-services", e);
    return err(500, e.message || String(e));
  }
}
