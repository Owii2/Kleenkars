// netlify/functions/admin-bookings.js
import { neon } from "@netlify/neon";
import jwt from "jsonwebtoken";

const REQUIRED_ENV = ["DATABASE_URL", "ADMIN_JWT_SECRET"];

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function assertEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }
}

function authz(event) {
  const hdr = event.headers?.authorization || event.headers?.Authorization || "";
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return jwt.verify(m[1], process.env.ADMIN_JWT_SECRET);
  } catch {
    return null;
  }
}

export const handler = async (event) => {
  try {
    assertEnv();

    // Auth (admin only)
    const claims = authz(event);
    if (!claims) return json(401, { ok: false, error: "Unauthorized" });

    const sql = neon(process.env.DATABASE_URL);

    const qs = event.queryStringParameters || {};
    const from = (qs.from || "").trim();     // YYYY-MM-DD
    const to = (qs.to || "").trim();         // YYYY-MM-DD
    const service = (qs.service || "").trim();
    const search = (qs.search || "").trim();
    const limit = Math.min(1000, Math.max(1, parseInt(qs.limit || "500", 10)));

    const where = [];
    const params = [];

    if (from) {
      params.push(from);
      where.push(`date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      where.push(`date <= $${params.length}::date`);
    }
    if (service) {
      params.push(service);
      where.push(`service = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      // phone kept as text compare; name ILIKE
      where.push(`(name ILIKE $${params.length - 1} OR phone ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const q = `
      SELECT
        order_id, name, phone, vehicle, service, date, time, visit, address, price,
        created_at
      FROM bookings
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1};
    `;
    params.push(limit);

    const rows = await sql(q, params);

    return json(200, { ok: true, rows });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};
