// netlify/functions/saveBooking.js
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body || "{}");

    if (!data.name || !data.phone || !data.vehicle || !data.service || !data.date || !data.time) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing required fields" })
      };
    }

    // --- Normalize date (force YYYY-MM-DD)
    let cleanDate = data.date;
    try {
      cleanDate = new Date(data.date).toISOString().split("T")[0];
    } catch {
      cleanDate = data.date; // fallback
    }

    // --- Normalize time (force HH:MM 24h)
    let cleanTime = data.time;
    try {
      const d = new Date(`1970-01-01T${data.time}`);
      const hh = String(d.getUTCHours()).padStart(2,"0");
      const mm = String(d.getUTCMinutes()).padStart(2,"0");
      cleanTime = `${hh}:${mm}`;
    } catch {
      cleanTime = data.time; // fallback
    }

    // Ensure table exists
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

    // Insert booking
    await pool.query(
      `INSERT INTO kleenkars_bookings
       (name, phone, vehicle, service, date, time, visit, address, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        data.name.trim(),
        String(data.phone).replace(/\D/g,"").slice(0,10),
        data.vehicle,
        data.service,
        cleanDate,
        cleanTime,
        data.visit || "In-Shop",
        data.address || "",
        parseInt(data.price || 0, 10)
      ]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        admin: process.env.ADMIN_PHONE || null,
        manager: process.env.MANAGER_PHONE || null
      })
    };
  } catch (err) {
    console.error("Error saving booking:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}
