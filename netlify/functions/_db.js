// netlify/functions/_db.js
import { Pool } from "@neondatabase/serverless";

/**
 * Tries multiple common env var names to find the Neon/Postgres connection string.
 * Returns a Pool you can import from other functions.
 */
function resolveConnectionString() {
  const triedKeys = [
    "DATABASE_URL",        // what we've been using
    "NEON_DATABASE_URL",   // some Netlify-Neon setups use this
    "POSTGRES_URL",        // generic
    "PG_CONNECTION_STRING" // sometimes used
  ];

  for (const key of triedKeys) {
    const val = process.env[key];
    if (val && typeof val === "string" && val.trim()) {
      return { connectionString: val, usedKey: key, triedKeys };
    }
  }

  // Try to build from PG* parts if they exist
  const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT } = process.env;
  if (PGHOST && PGDATABASE && PGUSER) {
    const port = PGPORT || "5432";
    const pwd = encodeURIComponent(PGPASSWORD || "");
    const usr = encodeURIComponent(PGUSER);
    const connectionString =
      `postgresql://${usr}:${pwd}@${PGHOST}:${port}/${PGDATABASE}?sslmode=require`;
    return { connectionString, usedKey: "PG* parts", triedKeys };
  }

  return { connectionString: null, usedKey: null, triedKeys };
}

const { connectionString, usedKey, triedKeys } = resolveConnectionString();

if (!connectionString) {
  // Throwing here surfaces a clear error if any function imports this without a DB URL set.
  throw new Error(
    `No Postgres connection string found. Tried keys: ${triedKeys.join(", ")} ` +
    `and PG* parts (PGHOST/PGDATABASE/PGUSER/PGPASSWORD). ` +
    `Please set one of these in Netlify Environment Variables.`
  );
}

export const dbInfo = { usedKey };
export const pool = new Pool({ connectionString });
