// netlify/functions/saveBooking.js
import { pool } from "./_db.js";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(obj),
  };
}

// Find the smallest positive integer not used in order_id
async function getNextOrderId() {
  // Fast path: if table empty, return 1
  const c = await pool.query(`SELECT COUNT(*)::int AS c FROM kleenkars_bookings`);
  if ((c.rows[0]?.c ?? 0) === 0) return 1;

  // Get all order_ids (not too many for this app) and compute the first gap
  const r = await pool.query(`SELECT order_id FROM kleenkars_bookings ORDER BY order_id ASC`);
  let expected = 1;
  for (const row of r.rows) {
    const id = Number(row.order_id);
    if (id > expected) break;          // found a gap
    if (id === expected) expected++;   // move to next expected
  }
  return expected; // first missing
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body || "{}");

    // Required fields
    if (!data.name || !data.phone || !data.vehicle || !data.service || !data.date || !data.time) {
      return json(400, { ok: false, error: "Missing required fields" });
    }

    // Normalize/sanitize
    const name = String(data.name || "").trim().slice(0, 200);
    const phone = String(data.phone || "").replace(/\D/g, "").slice(0, 15);
    const vehicle = String(data.vehicle || "").trim();
    const service = String(data.service || "").trim();
    const visit = (data.visit || "In-Shop").toString();
    const address = String(data.address || "").trim().slice(0, 500);
    const price = Number.parseInt(data.price || 0, 10) || 0;

    // date → YYYY-MM-DD
    let cleanDate = String(data.date || "").trim();
    try { cleanDate = new Date(cleanDate).toISOString().split("T")[0]; } catch {}

    // time → HH:MM (24h)
    let cleanTime = String(data.time || "").trim();
    try {
      const d = new Date(`1970-01-01T${cleanTime}`);
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      cleanTime = `${hh}:${mm}`;
    } catch {}

    // Ensure table & columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,           -- will set NOT NULL after backfilling
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

    // Make sure order_id column exists & is unique
    // (If created above, UNIQUE is already in definition; this is safe for older tables.)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
            WHERE table_name='kleenkars_bookings' AND column_name='order_id'
        ) THEN
          ALTER TABLE kleenkars_bookings ADD COLUMN order_id INT;
        END IF;
        BEGIN
          ALTER TABLE kleenkars_bookings ADD CONSTRAINT kleenkars_bookings_order_id_key UNIQUE(order_id);
        EXCEPTION WHEN duplicate_table THEN
          -- constraint already exists
          NULL;
        END;
      END$$;
    `);

    // Compute the smallest available order_id
    const nextId = await getNextOrderId();

    // Insert booking (with order_id)
    await pool.query(
      `INSERT INTO kleenkars_bookings
       (order_id, name, phone, vehicle, service, date, time, visit, address, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [nextId, name, phone, vehicle, service, cleanDate, cleanTime, visit, address, price]
    );

    const admin = (process.env.ADMIN_PHONE || "").replace(/\D/g, "") || null;
    const manager = (process.env.MANAGER_PHONE || "").replace(/\D/g, "") || null;

    return json(200, { ok: true, order_id: nextId, admin, manager });
  } catch (err) {
    console.error("saveBooking error:", err);
    return json(500, { ok: false, error: err.message });
  }
}
