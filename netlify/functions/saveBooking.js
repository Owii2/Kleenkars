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

const HOME_SURCHARGE = 50;

function normText(v, max = 500) { return String(v ?? "").trim().slice(0, max); }
function normPhone(v) { return String(v || "").replace(/\D/g, "").slice(0, 15); }
function normDate(v) {
  try { return new Date(v).toISOString().split("T")[0]; } catch { return ""; }
}
function normTime(v) {
  try {
    const d = new Date(`1970-01-01T${v}`);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch { return ""; }
}

// Reuse gaps: 1,2,3… find smallest missing order_id
async function nextOrderId(sql) {
  const rows = await sql`SELECT order_id FROM kleenkars_bookings WHERE order_id IS NOT NULL ORDER BY order_id ASC`;
  let expected = 1;
  for (const r of rows) {
    const id = Number(r.order_id);
    if (id > expected) break;
    if (id === expected) expected++;
  }
  return expected;
}

function keyForVehicle(vehicle) {
  if (vehicle === "Bike") return "bike";
  if (vehicle === "SUV") return "suv";
  return "sedan"; // Hatch/Sedan
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }
  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");

  try {
    const body = JSON.parse(event.body || "{}");

    const name = normText(body.name, 200);
    const phone = normPhone(body.phone);
    const vehicle = normText(body.vehicle, 40);
    const service = normText(body.service, 120);
    const date = normDate(body.date);
    const time = normTime(body.time);
    const visit = normText(body.visit || "Wash Center", 40);
    const address = normText(body.address, 500);

    if (!name || !phone || !vehicle || !service || !date || !time) {
      return err(400, "Missing required fields");
    }

    const sql = neon(process.env.DATABASE_URL);

    // Ensure bookings table exists
    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Dynamic price from kleenkars_services
    const key = keyForVehicle(vehicle); // bike | sedan | suv
    const svcRows = await sql`
      SELECT name, bike, sedan, suv, visible
      FROM kleenkars_services
      WHERE name = ${service}
      LIMIT 1
    `;
    if (svcRows.length === 0) {
      return err(400, `${service} not available for ${vehicle}`);
    }
    const svc = svcRows[0];
    if (svc.visible === false) {
      return err(400, `${service} not available for ${vehicle}`);
    }
    let base = svc[key]; // null if not offered for that vehicle
    if (base == null) {
      return err(400, `${service} not available for ${vehicle}`);
    }
    let price = Number(base) || 0;
    if (visit === "Home Visit") price += HOME_SURCHARGE;

    // Allocate reusable order_id
    const order_id = await nextOrderId(sql);

    // Insert booking
    await sql`
      INSERT INTO kleenkars_bookings
      (order_id, name, phone, vehicle, service, date, time, visit, address, price)
      VALUES (${order_id}, ${name}, ${phone}, ${vehicle}, ${service}, ${date}, ${time}, ${visit}, ${address}, ${price})
    `;

    // Optional WhatsApp numbers
    const admin   = (process.env.ADMIN_PHONE || "").replace(/\D/g, "") || null;
    const manager = (process.env.MANAGER_PHONE || "").replace(/\D/g, "") || null;

    return ok({ ok: true, order_id, admin, manager });
  } catch (e) {
    console.error("saveBooking error:", e);
    return err(500, e.message || "Server error");
  }
}
