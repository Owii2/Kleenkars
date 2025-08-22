// netlify/functions/admin-bookings.js
import { pool } from "./_db.js";

/**
 * Returns bookings for the admin table.
 * - Auth: simple Bearer token presence (matches your current admin.html)
 * - Detects whether the table uses columns named "date"/"time" or alternatives like "booking_date"/"booking_time"
 */
export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // --- minimal token presence check (same as your admin.html)
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "Unauthorized" });
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return json(401, { ok: false, error: "Invalid token" });
  }

  try {
    // Ensure table exists (no-op if already there)
    await pool.query(`
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
    `);

    // Figure out which column names actually exist in your DB
    const colsRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kleenkars_bookings'
    `);
    const cols = new Set(colsRes.rows.map(r => r.column_name));

    // choose the actual column names (quoted identifiers where needed)
    const dateCol =
      cols.has("date") ? `"date"` :
      cols.has("booking_date") ? `booking_date` :
      `''::text`;

    const timeCol =
      cols.has("time") ? `"time"` :
      cols.has("booking_time") ? `booking_time` :
      `''::text`;

    // Build the SELECT using the detected cols, alias to "date"/"time" for the frontend
    const sql = `
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

    const result = await pool.query(sql);

    return json(200, { ok: true, rows: result.rows });
  } catch (err) {
    console.error("admin-bookings error:", err);
    return json(500, { ok: false, error: err.message });
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
