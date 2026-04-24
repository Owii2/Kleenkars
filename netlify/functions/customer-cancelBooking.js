// netlify/functions/customer-cancelBooking.js
import { neon, neonConfig } from "@neondatabase/serverless";
import { normPhone, verifyCustomerToken } from "./_otp.js";

neonConfig.fetchConnectionCache = true;

function json(status, obj){
  return { statusCode: status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }, body: JSON.stringify(obj) };
}

function hasValidCustomerAuth(event, phone) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return verifyCustomerToken(m[1], phone);
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

    const sql = neon(process.env.DATABASE_URL);

    const r = await sql`
      DELETE FROM kleenkars_bookings
      WHERE order_id = ${order_id} AND phone = ${phone}
      RETURNING order_id
    `;
    if(r.length === 0) return json(404, { ok:false, error:"Booking not found" });

    return json(200, { ok:true, order_id });
  }catch(err){
    console.error("customer-cancelBooking", err);
    return json(500, { ok:false, error: err.message });
  }
}
