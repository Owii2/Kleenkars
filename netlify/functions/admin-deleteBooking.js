// netlify/functions/admin-deleteBooking.js
import { neon } from "@netlify/neon";
import jwt from "jsonwebtoken";

const json = (s, b) => ({
  statusCode: s,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(b),
});

const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} missing`); return v; };
const authz = (event, secret) => {
  const hdr = event.headers?.authorization || event.headers?.Authorization || "";
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], secret); } catch { return null; }
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST")    return json(405, { ok:false, error:"Method not allowed" });

  try {
    const SECRET = need("ADMIN_JWT_SECRET");
    const DBURL  = need("DATABASE_URL");
    const claims = authz(event, SECRET);
    if (!claims) return json(401, { ok:false, error:"Unauthorized" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}
    const key = (body.order_id ?? body.id ?? "").toString().trim();
    if (!key) return json(400, { ok:false, error:"Missing order_id" });

    const sql = neon(DBURL);
    // Your schema: table "bookings", primary key column "id"
    const r = await sql(`DELETE FROM bookings WHERE id = $1 RETURNING id AS deleted_id`, [key]);

    if (!r.length) return json(404, { ok:false, error:"Booking not found" });
    return json(200, { ok:true, deleted: r[0].deleted_id });
  } catch (e) {
    return json(500, { ok:false, error: e.message });
  }
};
