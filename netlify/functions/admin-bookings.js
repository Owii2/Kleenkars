// netlify/functions/admin-bookings.js
import { withConnection } from "@netlify/neon";

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "";

export default withConnection(async (sql, event) => {
  // auth check
  const cookie = getCookie(event.headers || {}, "kk_admin");
  const ok = JWT_SECRET && cookie && await verify(cookie, JWT_SECRET);

  // ping from login.html to see if already logged-in
  if (event.httpMethod === "POST" && event.headers?.["x-auth-check"] === "1") {
    return { statusCode: ok ? 204 : 401 };
  }

  if (!ok) return json({ ok:false, error:"Unauthorized" }, 401);

  const rows = await sql/*sql*/`
    SELECT id, created_at, name, phone, vehicle, service, visit, address, date_on, time_at, price
    FROM kleenkars_bookings
    ORDER BY created_at DESC
    LIMIT 500
  `;
  return json({ ok:true, count: rows.length, bookings: rows });
});

// --- helpers
function json(data, code=200){ return { statusCode:code, headers:{ "Content-Type":"application/json" }, body: JSON.stringify(data) }; }
function getCookie(headers, name){
  const raw = headers.cookie || headers.Cookie || "";
  const parts = raw.split(/;\s*/);
  for (const p of parts){
    const [k, ...rest] = p.split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}
async function verify(token, secret){
  try {
    const [h,p,s] = token.split(".");
    if (!h || !p || !s) return false;
    const enc = new TextEncoder();
    const data = `${h}.${p}`;
    const expected = await hmacSHA256(enc.encode(data), enc.encode(secret));
    if (!timingSafeEqual(s, expected)) return false;
    const payload = JSON.parse(atoburl(p));
    if (payload.exp && Math.floor(Date.now()/1000) > payload.exp) return false;
    return true;
  } catch { return false; }
}
async function hmacSHA256(data, secret){
  const key = await crypto.subtle.importKey("raw", secret, { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bufToB64url(sig);
}
function bufToB64url(buf){
  const bin = String.fromCharCode(...new Uint8Array(buf));
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function atoburl(s){ return Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8"); }
function timingSafeEqual(a,b){
  if (a.length !== b.length) return false;
  let out = 0; for (let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
