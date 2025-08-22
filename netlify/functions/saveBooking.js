// netlify/functions/saveBooking.js
import { withConnection } from "@netlify/neon";

const ADMIN_WHATSAPP   = process.env.ADMIN_WHATSAPP   || "919910578378";
const MANAGER_WHATSAPP = process.env.MANAGER_WHATSAPP || "";

// simple in-memory rate limit (per function instance)
// note: serverless instances may cold-start; this is a best-effort throttle
const lastHit = new Map(); // key: ip, val: ms

export default withConnection(async (sql, event) => {
  if (event.httpMethod !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  // --- Rate limit: 1 booking / 30s per IP
  const ip = getClientIp(event);
  const now = Date.now();
  const prev = lastHit.get(ip) || 0;
  if (now - prev < 30_000) {
    return json({ ok:false, error:"Too many requests. Please wait a few seconds and try again." }, 429);
  }
  lastHit.set(ip, now);

  let body = {};
  try { body = JSON.parse(event.body || "{}"); }
  catch { return json({ ok:false, error:"Invalid JSON" }, 400); }

  // --- Basic presence checks
  const required = ["name","phone","vehicle","service","date","time","visit","price"];
  const missing = required.filter(k => body[k] === undefined || body[k] === null || String(body[k]).trim() === "");
  if (missing.length) return json({ ok:false, error: "Missing: " + missing.join(", ") }, 400);

  // --- Normalize
  const name     = String(body.name).trim();
  const phone10  = String(body.phone).replace(/\D/g, "");
  const vehicle  = String(body.vehicle);
  const service  = String(body.service);
  const visit    = String(body.visit);
  const address  = String(body.address || "").trim();
  const date_on  = String(body.date); // YYYY-MM-DD
  const time_at  = String(body.time); // HH:MM
  const price    = Number(body.price);

  if (phone10.length !== 10) return json({ ok:false, error:"Phone must be 10 digits" }, 400);
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(date_on)) return json({ ok:false, error:"Invalid date format (YYYY-MM-DD)" }, 400);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time_at)) return json({ ok:false, error:"Invalid time format (HH:MM 24h)" }, 400);

  // --- Service availability matrix (defense-in-depth)
  const allowed = {
    "Bike":        { "Basic": true,  "Premium": false, "Detailing": false },
    "Hatch/Sedan": { "Basic": true,  "Premium": true,  "Detailing": true  },
    "SUV":         { "Basic": true,  "Premium": true,  "Detailing": true  }
  };
  if (!allowed[vehicle] || !allowed[vehicle][service]) {
    return json({ ok:false, error:`${service} is not available for ${vehicle}` }, 400);
  }

  // --- Enforce business hours 10:00–20:00 in Asia/Kolkata on the chosen day
  // Compute minutes from midnight for the provided time
  const [hh, mm] = time_at.split(':').map(Number);
  const mins = hh * 60 + mm;
  if (mins < 600 || mins > 1200) { // 10*60 .. 20*60
    return json({ ok:false, error: "Please choose a time between 10:00 and 20:00 (IST)" }, 400);
  }

  // --- Ensure table exists (idempotent)
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
      (${id}, ${name}, ${phone10}, ${vehicle}, ${service}, ${visit}, ${address}, ${date_on}, ${time_at}, ${price})
  `;

  return json({ ok:true, id, admin: ADMIN_WHATSAPP, manager: MANAGER_WHATSAPP });
});

// helpers
function json(data, statusCode = 200) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}
function getClientIp(event){
  // Netlify forwards IP in these headers; pick the first available
  const h = event.headers || {};
  return h["x-nf-client-connection-ip"] || h["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
}
