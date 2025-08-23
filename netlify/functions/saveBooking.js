// netlify/functions/saveBooking.js
import { neon } from "@netlify/neon";

const json = (s, b) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(b),
});
const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} missing`); return v; };

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok:false, error:"Method not allowed" });
  }

  try {
    const DBURL = need("DATABASE_URL");
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}

    // Expect: name, phone (10 digits), vehicle, service, date (YYYY-MM-DD), time (HH:MM 24h)
    const name    = String(body.name || "").trim();
    const phone   = String(body.phone || "").replace(/\D/g, "");
    const vehicle = String(body.vehicle || "").trim();
    const service = String(body.service || "").trim();
    const date    = String(body.date || "").trim();   // YYYY-MM-DD
    const time    = String(body.time || "").trim();   // HH:MM (24h)
    const visit   = String(body.visit || "Wash Center").trim();
    const address = String(body.address || "").trim();

    if (!name) return json(400, { ok:false, error:"Missing name" });
    if (!/^\d{10}$/.test(phone)) return json(400, { ok:false, error:"Phone must be 10 digits" });
    if (!vehicle) return json(400, { ok:false, error:"Missing vehicle" });
    if (!service) return json(400, { ok:false, error:"Missing service" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { ok:false, error:"Invalid date" });
    if (!/^\d{2}:\d{2}$/.test(time)) return json(400, { ok:false, error:"Invalid time" });

    // Build timestamptz for Asia/Kolkata from date+time
    const dt = `${date} ${time}`; // e.g. "2025-08-23 14:30"

    const sql = neon(DBURL);

    // Insert into the REAL table your admin uses: bookings(id, name, phone, service, vehicle, datetime, created_at)
    const rows = await sql(
      `
      INSERT INTO bookings (name, phone, service, vehicle, datetime, created_at)
      VALUES (
        $1, $2, $3, $4,
        make_timestamptz(
          substr($5,1,4)::int,    -- YYYY
          substr($5,6,2)::int,    -- MM
          substr($5,9,2)::int,    -- DD
          substr($5,12,2)::int,   -- HH
          substr($5,15,2)::int,   -- MI
          0,
          'Asia/Kolkata'
        ),
        now()
      )
      RETURNING id;
      `,
      [name, phone, service, vehicle, dt]
    );

    const order_id = rows[0]?.id;

    // WhatsApp numbers (optional; digits only). These names match what index.html expects.
    const admin   = (process.env.ADMIN_WHATSAPP   || process.env.ADMIN_PHONE   || "").replace(/\D/g, "") || null;
    const manager = (process.env.MANAGER_WHATSAPP || process.env.MANAGER_PHONE || "").replace(/\D/g, "") || null;

    return json(200, { ok:true, order_id, admin, manager });
  } catch (e) {
    return json(500, { ok:false, error: e.message });
  }
};
