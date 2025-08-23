// netlify/functions/admin-updateBooking.js
import { neon } from "@netlify/neon";

const ok = (obj) => ({
  statusCode: 200,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS"
  },
  body: JSON.stringify(obj),
});
const err = (code, msg) => ({
  statusCode: code,
  headers: {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"authorization, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS"
  },
  body: JSON.stringify({ ok:false, error: msg }),
});

const PRICES = {
  "Bike":        { "Basic": 50,  "Premium": null, "Detailing": null },
  "Hatch/Sedan": { "Basic": 150, "Premium": 200,  "Detailing": 1500 },
  "SUV":         { "Basic": 200, "Premium": 250,  "Detailing": 2500 },
};
const HOME_SURCHARGE = 50;
function computePrice(vehicle, service, visit){
  let p = PRICES?.[vehicle]?.[service] ?? null;
  if (p == null) return null;
  if (visit === "Home Visit") p += HOME_SURCHARGE;
  return p;
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return ok({ ok:true });
  const auth = event.headers.authorization || event.headers.Authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try{
    const body = JSON.parse(event.body || "{}");
    const order_id = Number(body.order_id);
    if (!order_id) return err(400, "Missing order_id");

    // sanitize inputs
    const name    = String(body.name||"").trim().slice(0,200);
    const phone   = String(body.phone||"").replace(/\D/g,"").slice(0,15);
    const date    = String(body.date||"").trim();           // YYYY-MM-DD (text)
    const time    = String(body.time||"").trim();           // HH:MM (text)
    const vehicle = String(body.vehicle||"").trim();
    const service = String(body.service||"").trim();
    const visit   = String(body.visit||"").trim() || "Wash Center";
    const address = String(body.address||"").trim().slice(0,500);

    let price = body.price;
    if (price == null || price === "") {
      price = computePrice(vehicle, service, visit);
    } else {
      price = parseInt(price, 10);
      if (!Number.isFinite(price)) price = null;
    }

    const sql = neon(process.env.DATABASE_URL);

    // ensure canonical table exists (same schema used by saveBooking)
    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const r = await sql`
      UPDATE kleenkars_bookings
      SET name=${name}, phone=${phone}, vehicle=${vehicle}, service=${service},
          date=${date}, time=${time}, visit=${visit}, address=${address}, price=${price}
      WHERE order_id=${order_id}
      RETURNING order_id
    `;
    if (r.length === 0) return err(404, "Booking not found");

    return ok({ ok:true, order_id });
  }catch(e){
    console.error("admin-updateBooking", e);
    return err(500, e.message || String(e));
  }
}
