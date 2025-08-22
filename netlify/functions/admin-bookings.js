// netlify/functions/admin-bookings.js
import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    const rows = await sql`SELECT id, name, phone, vehicle, service, date, time, visit, address, price 
                           FROM bookings ORDER BY created_at DESC`;

    return new Response(JSON.stringify({ ok: true, bookings: rows }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("DB error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
