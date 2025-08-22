// netlify/functions/admin-login.js
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "";

export default async (event) => {
  if (event.httpMethod !== "POST") return res(405, { ok:false, error:"Method Not Allowed" });

  if (!PASSWORD || !JWT_SECRET) {
    return res(500, { ok:false, error:"Server missing ADMIN_PASSWORD or ADMIN_JWT_SECRET" });
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { password } = body;

  if (!password || password !== PASSWORD) {
    return res(401, { ok:false, error:"Invalid password" });
  }

  const iat = Math.floor(Date.now()/1000);
  const exp = iat + 60*60*24; // 24h
  const token = await signJWT({ sub:"admin", role:"admin", iat, exp }, JWT_SECRET);

  // cookie
  const cookie = [
    `kk_admin=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${60*60*24}`
  ].join("; ");

  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": cookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ok:true })
  };
};

// ---- helpers
function res(code, jsonObj){
  return { statusCode: code, headers:{ "Content-Type":"application/json" }, body: JSON.stringify(jsonObj) };
}

async function signJWT(payload, secret){
  const enc = new TextEncoder();
  const header = { alg:"HS256", typ:"JWT" };
  const b64 = (obj) => b64url(JSON.stringify(obj));
  const data = `${b64(header)}.${b64(payload)}`;
  const sig = await hmacSHA256(enc.encode(data), enc.encode(secret));
  return `${data}.${sig}`;
}
async function verifyJWT(token, secret){
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const enc = new TextEncoder();
  const data = `${h}.${p}`;
  const expected = await hmacSHA256(enc.encode(data), enc.encode(secret));
  if (timingSafeEqual(s, expected) === false) return null;
  const payload = JSON.parse(atoburl(p));
  if (payload.exp && Math.floor(Date.now()/1000) > payload.exp) return null;
  return payload;
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
function b64url(s){ return Buffer.from(s, "utf8").toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function atoburl(s){ return Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8"); }
function timingSafeEqual(a,b){
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
