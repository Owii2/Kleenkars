// netlify/functions/envDump.js
export async function handler() {
  const keys = [
    "DATABASE_URL",
    "NEON_DATABASE_URL",
    "POSTGRES_URL",
    "PG_CONNECTION_STRING",
    "PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGPORT"
  ];

  const redacted = {};
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.length) {
      // show only non-sensitive meta
      redacted[k] = {
        present: true,
        length: v.length,
        startsWith: v.slice(0, 12),
        endsWith: v.slice(-12)
      };
    } else {
      redacted[k] = { present: false };
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, vars: redacted }, null, 2)
  };
}
