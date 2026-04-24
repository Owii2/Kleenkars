// netlify/functions/customer-updateBooking.js
import { neon, neonConfig } from "@neondatabase/serverless";
import { normPhone, verifyCustomerToken } from "./_otp.js";

neonConfig.fetchConnectionCache = true;
const HOME_SURCHARGE = 50;

function json(status, obj){
  return { statusCode: status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }, body: JSON.stringify(obj) };
}

function hasValidCustomerAuth(event, phone) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return verifyCustomerToken(m[1], phone);
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

function keyForVehicle(vehicle) {
  if (vehicle === "Bike") return "bike";
  if (vehicle === "SUV") return "suv";
  return "sedan";
}

export async function handler(event){
  if(event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

  try{
    const body = JSON.parse(event.body || "{}");
    const phone = normPhone(body.phone || "");
    const order_id = Number(body.order_id);
    if(!phone || !order_id) return json(400, { ok:false, error:"Missing phone/order_id" });

    if (!hasValidCustomerAuth(event, phone)) {
      return json(401, { ok:false, error:"Unauthorized. Verify OTP first and use customer token." });
    }

    let { date, time, vehicle, service, visit, address } = body;
    vehicle = String(vehicle||"").trim();
    service = String(service||"").trim();
    visit = String(visit||"Wash Center").trim();
    address = String(address||"").trim().slice(0,500);

    date = normDate(date);
    time = normTime(time);
    if (!date || !time) return json(400, { ok:false, error:"Invalid date/time" });

    const sql = neon(process.env.DATABASE_URL);

    const svcRows = await sql`
      SELECT name, bike, sedan, suv, visible
      FROM kleenkars_services
      WHERE name = ${service}
      LIMIT 1
    `;
    if (svcRows.length === 0 || svcRows[0].visible === false) {
      return json(400, { ok:false, error:`${service} not available for ${vehicle}` });
    }

    const key = keyForVehicle(vehicle);
    const base = svcRows[0][key];
    if (base == null) {
      return json(400, { ok:false, error:`${service} not available for ${vehicle}` });
    }
    let price = Number(base) || 0;
    if (visit === "Home Visit") price += HOME_SURCHARGE;

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
