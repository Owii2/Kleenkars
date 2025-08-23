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
  await sql`ALTER TABLE kleenkars_services ADD COLUMN IF NOT EXISTS position INT NULL`;

  // backfill missing positions
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

// Pack positions tightly: 1..N in display order
async function compactPositions(sql){
  await sql`
    WITH ranked AS (
      SELECT name, ROW_NUMBER() OVER (ORDER BY position ASC NULLS LAST, name ASC) AS rn
      FROM kleenkars_services
    )
    UPDATE kleenkars_services s
       SET position = r.rn
      FROM ranked r
     WHERE s.name = r.name
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
  const sedanCol  = ["sedan","hatch","hatchback","hatch_sedan","hatchback_sedan","car"].find(c =>
