// netlify/functions/saveBooking.js
import { Pool } from "@neondatabase/serverless";

// Pick up the Neon connection string from Netlify env
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL env var");
}
const pool = new Pool({ connectionString });

export async function handler(event) {
  // Allow simple OPTIONS preflight (harmless even if same-origin)
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

    // ---- Basic validation (frontend also checks)
    const missing =
      !data.name || !data.phone || !data.vehicle || !data.service || !data.date || !data.time;
    if (missing) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing required fields" })
      };
    }

    // ---- Normalize inputs
    const name = String(data.name || "").trim().slice(0, 200);
    const phone = String(data.phone || "").replace(/\D/g, "").slice(0, 15); // keep digits only
    const vehicle = String(data.vehicle || "").trim();
    const service = String(data.service || "").trim();
    const visit = (data.visit || "In-Shop").toString();
    const address = String(data.address || "").trim().slice(0, 500);
    const price = Number.parseInt(data.price || 0, 10) || 0;

    // date → YYYY-MM-DD
    let cleanDate = String(data.date || "").trim();
    try {
      cleanDate = new Date(cleanDate).toISOString().split("T")[0];
    } catch {
      /* keep as-is */
    }

    // time → HH:MM (24h)
    let cleanTime = String(data.time || "").trim();
    try {
      const d = new Date(`1970-01-01T${cleanTime}`);
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      cleanTime = `${hh}:${mm}`;
    } catch {
      /* keep as-is */
    }

    // ---- Ensure table exists
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

    // ---- Insert
    await pool.query(
      `INSERT INTO kleenkars_bookings
       (name, phone, vehicle, service, date, time, visit, address, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [name, phone, vehicle, service, cleanDate, cleanTime, visit, address, price]
    );

    // Phones for WhatsApp (digits only, with country code, or null)
    const admin = (process.env.ADMIN_PHONE || "").replace(/\D/g, "") || null;
    const manager = (process.env.MANAGER_PHONE || "").replace(/\D/g, "") || null;

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, admin, manager })
    };
  } catch (err) {
    console.error("Error saving booking:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}
