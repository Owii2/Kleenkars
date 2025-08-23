// netlify/functions/admin-deleteBooking.js
import { neon } from "@netlify/neon";
import jwt from "jsonwebtoken";

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(obj),
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify({ ok: false, error: msg }),
});

function authz(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], process.env.ADMIN_JWT_SECRET); }
  catch { return null; }
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return ok({ ok: true });
  if (!authz(event)) return err(401, "Unauthorized");
  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");

  try {
    const { order_id } = JSON.parse(event.body || "{}");
    const id = Number(order_id);
    if (!id) return err(400, "Missing order_id");

    const sql = neon(process.env.DATABASE_URL);

    // Ensure canonical table exists (same schema used by saveBooking)
    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const r = await sql`DELETE FROM kleenkars_bookings WHERE order_id = ${id} RETURNING order_id`;
    if (r.length === 0) return err(404, "Booking not found");

    return ok({ ok: true, order_id: id });
  } catch (e) {
    console.error("admin-deleteBooking", e);
    return err(500, e.message || String(e));
  }
}
