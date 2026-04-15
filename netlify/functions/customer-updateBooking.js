// netlify/functions/customer-updateBooking.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const PRICES = {
  "Bike":        { "Basic": 50,  "Premium": null, "Detailing": null },
  "Hatch/Sedan": { "Basic": 150, "Premium": 200,  "Detailing": 1500 },
  "SUV":         { "Basic": 200, "Premium": 250,  "Detailing": 2500 }
};
const HOME_SURCHARGE = 50;

function json(status, obj){
  return { statusCode: status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }, body: JSON.stringify(obj) };
}

function computePrice(v, s, visit){
  let p = PRICES?.[v]?.[s] ?? null;
  if(p==null) return null;
  if(visit === "Home Visit") p += HOME_SURCHARGE;
  return p;
}
function normDate(v){
  const d = new Date(String(v ?? ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}
function normTime(v){
  const s = String(v ?? "").trim();
  const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return "";
  const hh = String(Number(m[1])).padStart(2, "0");
  return `${hh}:${m[2]}`;
}

export async function handler(event){
  if(event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

  try{
    const body = JSON.parse(event.body || "{}");
    const phone = String(body.phone||"").replace(/\D/g,"").slice(0,15);
    const order_id = Number(body.order_id);
    if(!phone || !order_id) return json(400, { ok:false, error:"Missing phone/order_id" });

    let { date, time, vehicle, service, visit, address } = body;
    vehicle = String(vehicle||"").trim();
    service = String(service||"").trim();
    visit = String(visit||"In-Shop").trim();
    address = String(address||"").trim().slice(0,500);

    // normalize date/time
    date = normDate(date);
    time = normTime(time);
    if (!date || !time) return json(400, { ok:false, error:"Invalid date/time" });

    const price = computePrice(vehicle, service, visit);
    if(price == null) return json(400, { ok:false, error:`${service} not available for ${vehicle}` });

    const sql = neon(process.env.DATABASE_URL);

    // Ensure booking exists and belongs to phone
    const existing = await sql`
      SELECT order_id FROM kleenkars_bookings WHERE order_id = ${order_id} AND phone = ${phone} LIMIT 1
    `;
    if(existing.length === 0) return json(404, { ok:false, error:"Booking not found" });

    await sql`
      UPDATE kleenkars_bookings
      SET date=${date}, time=${time}, vehicle=${vehicle}, service=${service},
          visit=${visit}, address=${address}, price=${price}
      WHERE order_id=${order_id} AND phone=${phone}
    `;

    return json(200, { ok:true, order_id, price });
  }catch(err){
    console.error("customer-updateBooking", err);
    return json(500, { ok:false, error: err.message });
  }
}
