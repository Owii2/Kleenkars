// netlify/functions/admin-bookings.js
import { neon } from "@netlify/neon";
import jwt from "jsonwebtoken";

const REQUIRED_ENV = ["DATABASE_URL", "ADMIN_JWT_SECRET"];

// small helpers
const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  },
  body: JSON.stringify(body),
});

const assertEnv = () => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
};

const authz = (event) => {
  const hdr = event.headers?.authorization || event.headers?.Authorization || "";
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return jwt.verify(m[1], process.env.ADMIN_JWT_SECRET);
  } catch {
    return null;
  }
};

export const handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    assertEnv();

    // Admin auth required
    const claims = authz(event);
    if (!claims) return json(401, { ok: false, error: "Unauthorized (missing/invalid token)" });

    const sql = neon(process.env.DATABASE_URL);

    const qs = event.queryStringParameters || {};
    const from = (qs.from || "").trim();     // YYYY-MM-DD
    const to = (qs.to || "").trim();         // YYYY-MM-DD
    const service = (qs.service || "").trim();
    const search = (qs.search || "").trim();
    const limit = Math.min(1000, Math.max(1, parseInt(qs.limit || "500", 10)));

    const where = [];
    const params = [];

    // Quote identifiers that are also type names in Postgres
    // Our table has: order_id, name, phone, vehicle, service, "date", "time", visit, address, price, created_at

    if (from) {
      params.push(from);
      where.push(`"date" >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      where.push(`"date" <= $${params.length}::date`);
    }
    if (service) {
      params.push(service);
      where.push(`service = $${params.length}`);
    }
    if (search) {
      // search both name and phone
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      where.push(`(name ILIKE $${params.length - 1} OR phone ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const q = `
      SELECT
        order_id, name, phone, vehicle, service,
        "date", "time", visit, address, price, created_at
      FROM bookings
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1};
    `;
    params.push(limit);

    const rows = await sql(q, params);
    return json(200, { ok: true, rows });
  } catch (err) {
    // Return the actual message so the UI shows it
    return json(500, { ok: false, error: err.message || String(err) });
  }
};
