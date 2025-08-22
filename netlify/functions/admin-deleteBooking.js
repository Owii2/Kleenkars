// netlify/functions/admin-deleteBooking.js
import { neon, neonConfig } from "@neondatabase/serverless";
neonConfig.fetchConnectionCache = true;

const ok = (obj) => ({
  statusCode: 200, headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" }, body: JSON.stringify(obj)
});
const err = (code, msg) => ({
  statusCode: code, headers: { "Content-Type":"application/json","Access-Control-Allow-Origin":"*" }, body: JSON.stringify({ ok:false, error: msg })
});

export async function handler(event){
  if (event.httpMethod !== "POST") return err(405, "Method Not Allowed");
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return err(401, "Unauthorized");

  try{
    const { order_id } = JSON.parse(event.body || "{}");
    const id = Number(order_id);
    if (!id) return err(400, "Missing order_id");

    const sql = neon(process.env.DATABASE_URL);
    const r = await sql`DELETE FROM kleenkars_bookings WHERE order_id=${id} RETURNING order_id`;
    if (r.length === 0) return err(404, "Booking not found");

    return ok({ ok:true, order_id: id });
  }catch(e){
    console.error("admin-deleteBooking", e);
    return err(500, e.message);
  }
}
