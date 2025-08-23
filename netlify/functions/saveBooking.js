// netlify/functions/saveBooking.js
import { neon } from "@netlify/neon";

const json = (s, b) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(b),
});
const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} missing`); return v; };

// same rules as UI
const PRICES = {
  "Bike":        { "Basic": 50,  "Premium": null, "Detailing": null },
  "Hatch/Sedan": { "Basic": 150, "Premium": 200,  "Detailing": 1500 },
  "SUV":         { "Basic": 200, "Premium": 250,  "Detailing": 2500 }
};
const HOME_SURCHARGE = 50;
function computeServerPrice(vehicle, service, visit){
  let p = PRICES?.[vehicle]?.[service] ?? null;
  if (p == null) return null;
  if (String(visit||"").toLowerCase().includes("home")) p += HOME_SURCHARGE;
  return p;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok:false, error:"Method not allowed" });
  }

  try {
    const DBURL = need("DATABASE_URL");
    let b = {};
    try { b = JSON.parse(event.body || "{}"); } catch {}

    const name    = String(b.name || "").trim();
    const phone   = String(b.phone || "").replace(/\D/g, "");
    const vehicle = String(b.vehicle || "").trim();
    const service = String(b.service || "").trim();
    const date    = String(b.date || "").trim();   // YYYY-MM-DD
    const time    = String(b.time || "").trim();   // HH:MM (24h)
    const visit   = String(b.visit || "Wash Center").trim();
    const address = String(b.address || "").trim();
    // price from client (optional)
    const priceFromClient = Number.isFinite(+b.price) ? (+b.price) : null;

    if (!name) return json(400, { ok:false, error:"Missing name" });
    if (!/^\d{10}$/.test(phone)) return json(400, { ok:false, error:"Phone must be 10 digits" });
    if (!vehicle) return json(400, { ok:false, error:"Missing vehicle" });
    if (!service) return json(400, { ok:false, error:"Missing service" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { ok:false, error:"Invalid date" });
    if (!/^\d{2}:\d{2}$/.test(time)) return json(400, { ok:false, error:"Invalid time" });

    // verify/compute price server-side (trust but verify)
    const priceComputed = computeServerPrice(vehicle, service, visit);
    if (priceComputed == null) return json(400, { ok:false, error:`${service} not available for ${vehicle}` });

    const price = Number.isFinite(priceFromClient) ? priceFromClient : priceComputed;

    const dt = `${date} ${time}`; // "YYYY-MM-DD HH:MM"

    const sql = neon(DBURL);

    // Ensure the columns exist (safe to run every time)
    await sql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'bookings' AND column_name = 'price'
        ) THEN
          ALTER TABLE bookings ADD COLUMN price INT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'bookings' AND column_name = 'visit'
        ) THEN
          ALTER TABLE bookings ADD COLUMN visit TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'bookings' AND column_name = 'address'
        ) THEN
          ALTER TABLE bookings ADD COLUMN address TEXT;
        END IF;
      END$$;
    `);

    // Insert into your real table
    const rows = await sql(
      `
      INSERT INTO bookings (name, phone, service, vehicle, datetime, price, visit, address, created_at)
      VALUES (
        $1, $2, $3, $4,
        make_timestamptz(
          substr($5,1,4)::int,
          substr($5,6,2)::int,
          substr($5,9,2)::int,
          substr($5,12,2)::int,
          substr($5,15,2)::int,
          0,
          'Asia/Kolkata'
        ),
        $6, $7, $8, now()
      )
      RETURNING id;
      `,
      [name, phone, service, vehicle, dt, price, visit, address]
    );

    const order_id = rows[0]?.id;

    const admin   = (process.env.ADMIN_WHATSAPP   || process.env.ADMIN_PHONE   || "").replace(/\D/g, "") || null;
    const manager = (process.env.MANAGER_WHATSAPP || process.env.MANAGER_PHONE || "").replace(/\D/g, "") || null;

    return json(200, { ok:true, order_id, admin, manager });
  } catch (e) {
    return json(500, { ok:false, error: e.message });
  }
};
