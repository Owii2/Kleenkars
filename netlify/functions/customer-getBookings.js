// netlify/functions/customer-getBookings.js
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
  try{
    const phone = normPhone(event.queryStringParameters?.phone || "");
    if(!phone) return json(400, { ok:false, error:"Missing phone" });

    if (!hasValidCustomerAuth(event, phone)) {
      return json(401, { ok:false, error:"Unauthorized. Verify OTP first and use customer token." });
    }

    const sql = neon(process.env.DATABASE_URL);

    await sql`
      CREATE TABLE IF NOT EXISTS kleenkars_bookings (
        id SERIAL PRIMARY KEY,
        order_id INT UNIQUE,
        name TEXT, phone TEXT, vehicle TEXT, service TEXT,
        date TEXT, time TEXT, visit TEXT, address TEXT, price INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const rows = await sql`
      SELECT order_id, name, phone, vehicle, service, date, time, visit, address, price, created_at
      FROM kleenkars_bookings
      WHERE phone = ${phone}
      ORDER BY created_at DESC
    `;

    return json(200, { ok:true, rows });
  }catch(err){
    console.error("customer-getBookings", err);
    return json(500, { ok:false, error: err.message });
  }
}
