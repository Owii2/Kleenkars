// netlify/functions/_whoami.js
import jwt from "jsonwebtoken";

const json = (s, b) => ({
  statusCode: s,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  },
  body: JSON.stringify(b, null, 2),
});

export const handler = async (event) => {
  try {
    const SECRET = process.env.ADMIN_JWT_SECRET || "";
    if (!SECRET) return json(500, { ok:false, error:"ADMIN_JWT_SECRET missing in env" });

    const hdr = event.headers?.authorization || event.headers?.Authorization || "";
    const m = hdr.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok:false, error:"No Authorization Bearer token provided" });

    let claims;
    try { claims = jwt.verify(m[1], SECRET); }
    catch (e) { return json(401, { ok:false, error:"Invalid token for current ADMIN_JWT_SECRET", detail: e.message }); }

    return json(200, { ok:true, claims });
  } catch (e) {
    return json(500, { ok:false, error: e.message });
  }
};
