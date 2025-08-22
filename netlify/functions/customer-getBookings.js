// netlify/functions/customer-getBookings.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

function json(status, obj){
  return { statusCode: status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }, body: JSON.stringify(obj) };
}

export async function handler(event){
  try{
    const phone = String((event.queryStringParameters?.phone||"")).replace(/\D/g,"").slice(0,15);
    if(!phone) return json(400, { ok:false, error:"Missing phone" });

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
