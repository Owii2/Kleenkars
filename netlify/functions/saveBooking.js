// netlify/functions/saveBooking.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(obj),
});
const err = (code, message) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify({ ok: false, error: message }),
});

// server-side price guard (same rules as UI)
const PRICES = {
  "Bike":        { "Basic": 50,  "Premium": null, "Detailing": null },
  "Hatch/Sedan": { "Basic": 150, "Premium": 200,  "Detailing": 1500 },
  "SUV":         { "Basic": 200, "Premium": 250,  "Detailing": 2500 }
};
const HOME_SURCHARGE = 50;

function computePrice(vehicle, service, visit){
  let p = PRICES?.[vehicle]?.[service] ?? null;
  if (p == null) return null;
  if (visit === "Home Visit") p += HOME_SURCHARGE;
  return p;
}

// Find smallest positive missing order_id (1,2,3… reuse gaps)
async function nextOrderId(sql){
  const rows = await sql`SELECT order_id FROM kleenkars_bookings WHERE order_id IS NOT NULL ORDER BY order_id ASC`;
  let expected = 1;
  for (const r of rows) {
    const id = Number(r.order_id);
    if (id > expected) break;
    if (id === expected) expected++;
  }
  return expected;
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

  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");

  try {
    const data = JSON.parse(event.body || "{}");
    // required fields
    if (!data.name || !data.phone || !data.vehicle || !data.service || !data.date || !data.time) {
      return err(400, "Missing required fields");
    }

    // sanitize
    const name = String(data.name || "").trim().slice(0,200);
    const phone = String(data.phone || "").replace(/\D/g,"").slice(0,15);
    const vehicle = String(data.vehicle || "").trim();
    const service = String(data.service || "").trim();
    const visit = String(data.visit || "In-Shop").trim();
    const address = String(data.address || "").trim().slice(0,500);

    // normalize date -> YYYY-MM-DD
    let date = String(data.date || "").trim();
    try { date = new Date(date).toISOString().split("T")[0]; } catch {}
    // normalize time -> HH:MM (24h)
    let time = String(data.time || "").trim();
    try {
      const d = new Date(`1970-01-01T${time}`);
      const hh = String(d.getUTCHours()).padStart(2,"0");
      const mm = String(d.getUTCMinutes()).padStart(2,"0");
      time = `${hh}:${mm}`;
    } catch {}

    // server-side price check
    const price = computePrice(vehicle, service, visit);
    if (price == null) return err(400, `${service} not available for ${vehicle}`);

    const sql = neon(process.env.DATABASE_URL);

    // ensure table
    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // get next reusable order_id
    const order_id = await nextOrderId(sql);

    // insert
    await sql`
      INSERT INTO kleenkars_bookings
      (order_id, name, phone, vehicle, service, date, time, visit, address, price)
      VALUES (${order_id}, ${name}, ${phone}, ${vehicle}, ${service}, ${date}, ${time}, ${visit}, ${address}, ${price})
    `;

    // WhatsApp numbers (optional env vars, digits only)
    const admin = (process.env.ADMIN_PHONE || "").replace(/\D/g,"") || null;
    const manager = (process.env.MANAGER_PHONE || "").replace(/\D/g,"") || null;

    return ok({ ok: true, order_id, admin, manager });
  } catch (e) {
    console.error("saveBooking error:", e);
    return err(500, e.message);
  }
}
