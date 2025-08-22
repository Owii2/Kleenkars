// netlify/functions/admin-updateBooking.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const P = {
  "Bike":        { "Basic": 50,  "Premium": null, "Detailing": null },
  "Hatch/Sedan": { "Basic": 150, "Premium": 200,  "Detailing": 1500 },
  "SUV":         { "Basic": 200, "Premium": 250,  "Detailing": 2500 }
};
const HOME_SURCHARGE = 50;

const ok = (obj) => ({
  statusCode: 200, headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" }, body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code, headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" }, body: JSON.stringify({ ok:false, error: msg })
});

function recomputePrice(vehicle, service, visit){
  let p = P?.[vehicle]?.[service] ?? null;
  if (p == null) return null;
  if (visit === "Home Visit") p += HOME_SURCHARGE;
  return p;
}

export async function handler(event){
  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try{
    const body = JSON.parse(event.body || "{}");
    const order_id = Number(body.order_id);
    if (!order_id) return err(400, "Missing order_id");

    let { name, phone, date, time, vehicle, service, visit, address } = body;
    name = String(name||"").trim().slice(0,200);
    phone = String(phone||"").replace(/\D/g,"").slice(0,15);
    vehicle = String(vehicle||"").trim();
    service = String(service||"").trim();
    visit = String(visit||"In-Shop").trim();
    address = String(address||"").trim().slice(0,500);

    // normalize date/time
    try { date = new Date(String(date)).toISOString().split("T")[0]; } catch {}
    try {
      const d = new Date(`1970-01-01T${String(time)}`);
      const hh = String(d.getUTCHours()).padStart(2,"0");
      const mm = String(d.getUTCMinutes()).padStart(2,"0");
      time = `${hh}:${mm}`;
    } catch {}

    const price = recomputePrice(vehicle, service, visit);
    if (price == null) return err(400, `${service} not available for ${vehicle}`);

    const sql = neon(process.env.DATABASE_URL);

    const exists = await sql`SELECT order_id FROM kleenkars_bookings WHERE order_id=${order_id} LIMIT 1`;
    if (exists.length === 0) return err(404, "Booking not found");

    await sql`
      UPDATE kleenkars_bookings
      SET name=${name}, phone=${phone}, vehicle=${vehicle}, service=${service},
          date=${date}, time=${time}, visit=${visit}, address=${address}, price=${price}
      WHERE order_id=${order_id}
    `;

    return ok({ ok:true, order_id, price });
  }catch(e){
    console.error("admin-updateBooking", e);
    return err(500, e.message);
  }
}
