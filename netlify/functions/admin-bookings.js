// netlify/functions/admin-bookings.js
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // --- Check for token
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "Unauthorized" })
    };
  }
  const token = auth.replace("Bearer ", "").trim();
  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "Invalid token" })
    };
  }

  try {
    // Ensure bookings table exists
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

    const result = await pool.query(
      "SELECT id, name, phone, vehicle, service, date, time, visit, address, price, created_at FROM kleenkars_bookings ORDER BY created_at DESC"
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, rows: result.rows })
    };
  } catch (err) {
    console.error("Error loading bookings:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}
