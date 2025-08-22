// netlify/functions/admin-bookings.js
import { neon, neonConfig } from "@neondatabase/serverless";

// Use HTTP fetch client (no WebSockets)
neonConfig.fetchConnectionCache = true;

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // --- minimal token presence check (matches admin.html)
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "Unauthorized" });
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return json(401, { ok: false, error: "Invalid token" });

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Ensure table exists (safe no-op if already there)
    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        name TEXT,
        phone TEXT,
        vehicle TEXT,
        service TEXT,
        date TEXT,
        time TEXT,
        visit TEXT,
        address TEXT,
        price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Detect actual column names present (some older tables might use booking_date/booking_time)
    const cols = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'kleenkars_bookings'
    `;
    const set = new Set(cols.map(r => r.column_name));

    const dateCol =
      set.has("date") ? `"date"` :
      set.has("booking_date") ? `booking_date` :
      `''::text`;

    const timeCol =
      set.has("time") ? `"time"` :
      set.has("booking_time") ? `booking_time` :
      `''::text`;

    // Build SELECT text with aliases for frontend
    const selectSql = `
      SELECT
        id,
        name,
        phone,
        vehicle,
        service,
        ${dateCol} AS "date",
        ${timeCol} AS "time",
        visit,
        address,
        price,
        created_at
      FROM kleenkars_bookings
      ORDER BY created_at DESC
    `;

    const rows = await sql(selectSql);

    return json(200, { ok: true, rows });
  } catch (err) {
    console.error("admin-bookings error:", err);
    return json(500, { ok: false, error: err.message });
  }
}
