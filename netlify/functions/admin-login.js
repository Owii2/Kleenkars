// netlify/functions/admin-login.js
import jwt from "jsonwebtoken";

const json = (s, b) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(b),
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

  const ADMIN_USER = process.env.ADMIN_USER || "";
  const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || "";
  const SECRET     = process.env.ADMIN_JWT_SECRET || "";

  if (!ADMIN_USER || !ADMIN_PASS || !SECRET) {
    return json(500, { ok:false, error:"Admin env vars missing (ADMIN_USER, ADMIN_PASS or ADMIN_PASSWORD, ADMIN_JWT_SECRET)" });
  }

  let creds = {};
  try { creds = JSON.parse(event.body || "{}"); } catch {}
  const { user = "", pass = "" } = creds;

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    return json(401, { ok:false, error:"Invalid credentials" });
  }

  const token = jwt.sign({ sub: ADMIN_USER, role:"admin" }, SECRET, { expiresIn: "7d" });
  return json(200, { ok:true, token });
};
