// netlify/functions/saveBooking.js
import { withConnection } from "@netlify/neon";

// Configure WhatsApp numbers via Netlify env vars later (step 3)
const ADMIN_WHATSAPP   = process.env.ADMIN_WHATSAPP   || "919910578378"; // e.g., 91XXXXXXXXXX
const MANAGER_WHATSAPP = process.env.MANAGER_WHATSAPP || "";             // optional

export default withConnection(async (sql, event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  // Basic validation
  const required = ["name","phone","vehicle","service","date","time","visit","price"];
  const missing = required.filter(k => body[k] === undefined || body[k] === null || String(body[k]).trim() === "");
  if (missing.length) return json({ ok:false, error: "Missing: " + missing.join(", ") }, 400);

  const phone10 = String(body.phone).replace(/\D/g, "");
  if (phone10.length !== 10) return json({ ok:false, error:"Phone must be 10 digits" }, 400);

  const vehicle = String(body.vehicle);
  const service = String(body.service);
  const visit   = String(body.visit);
  const date_on = String(body.date); // yyyy-mm-dd
  const time_at = String(body.time); // HH:MM
  const price   = Number(body.price);

  // Enforce availability rules
  const allowed = {
    "Bike":        { "Basic": true,  "Premium": false, "Detailing": false },
    "Hatch/Sedan": { "Basic": true,  "Premium": true,  "Detailing": true  },
    "SUV":         { "Basic": true,  "Premium": true,  "Detailing": true  }
  };
  if (!allowed[vehicle] || !allowed[vehicle][service]) {
    return json({ ok:false, error:`${service} is not available for ${vehicle}` }, 400);
  }

  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(date_on)) {
    return json({ ok:false, error:"Invalid date format (expected YYYY-MM-DD)" }, 400);
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time_at)) {
    return json({ ok:false, error:"Invalid time format (expected HH:MM 24h)" }, 400);
  }

  // Ensure table exists (idempotent)
  await sql/*sql*/`
    CREATE TABLE IF NOT EXISTS kleenkars_bookings (
      id         TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      name       TEXT NOT NULL,
      phone      TEXT NOT NULL,
      vehicle    TEXT NOT NULL,
      service    TEXT NOT NULL,
      visit      TEXT NOT NULL,
      address    TEXT,
      date_on    DATE NOT NULL,
      time_at    TIME NOT NULL,
      price      INTEGER NOT NULL
    )
  `;

  const id = "BKG-" + Date.now();

  await sql/*sql*/`
    INSERT INTO kleenkars_bookings
      (id, name, phone, vehicle, service, visit, address, date_on, time_at, price)
    VALUES
      (${id}, ${String(body.name).trim()}, ${phone10}, ${vehicle}, ${service},
       ${visit}, ${String(body.address || "").trim()}, ${date_on}, ${time_at}, ${price})
  `;

  return json({ ok:true, id, admin: ADMIN_WHATSAPP, manager: MANAGER_WHATSAPP });
});

// Helper
function json(data, statusCode = 200) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}
