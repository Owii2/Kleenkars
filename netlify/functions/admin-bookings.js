// netlify/functions/admin-bookings.js
import { neon } from "@netlify/neon";
import jwt from "jsonwebtoken";

const REQUIRED_ENV = ["DATABASE_URL", "ADMIN_JWT_SECRET"];

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

function assertEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
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

function qsVal(qs, k) {
  return (qs?.[k] ?? "").toString().trim();
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    assertEnv();

    // Require admin token
    const claims = authz(event);
    if (!claims) return json(401, { ok: false, error: "Unauthorized" });

    const sql = neon(process.env.DATABASE_URL);

    // --- detect actual columns on the bookings table
    const cols = await sql(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'bookings'`
    );
    const set = new Set(cols.map((r) => r.column_name));

    // helper: pick first existing column from candidates
    const pick = (...cands) => cands.find((c) => set.has(c));

    // canonical fields (nullable if absent)
    const col = {
      order_id: pick("order_id", "id"),
      name: pick("name"),
      phone: pick("phone"),
      vehicle: pick("vehicle"),
      service: pick("service"),
      date: pick("date", "booking_date"),
      time: pick("time", "booking_time"),
      visit: pick("visit", "visit_type"),
      address: pick("address"),
      price: pick("price", "amount"),
      created_at: pick("created_at", "created", "inserted_at"),
    };

    // --- build SELECT list dynamically (alias to the frontend keys)
    const selectParts = [];
    const pushSel = (db, alias) => {
      if (db) selectParts.push(`${db} AS ${alias}`);
      else selectParts.push(`NULL::text AS ${alias}`); // keep shape stable
    };
    pushSel(col.order_id, "order_id");
    pushSel(col.name, "name");
    pushSel(col.phone, "phone");
    pushSel(col.vehicle, "vehicle");
    pushSel(col.service, "service");
    pushSel(col.date, "date");
    pushSel(col.time, "time");
    pushSel(col.visit, "visit");
    pushSel(col.address, "address");
    pushSel(col.price, "price");
    pushSel(col.created_at, "created_at");

    // --- filters from querystring
    const qs = event.queryStringParameters || {};
    const from = qsVal(qs, "from");   // YYYY-MM-DD
    const to = qsVal(qs, "to");       // YYYY-MM-DD
    const service = qsVal(qs, "service");
    const search = qsVal(qs, "search");
    const limit = Math.min(1000, Math.max(1, parseInt(qsVal(qs, "limit") || "500", 10)));

    const where = [];
    const params = [];

    if (from && col.date) {
      params.push(from);
      where.push(`${col.date} >= $${params.length}::date`);
    }
    if (to && col.date) {
      params.push(to);
      where.push(`${col.date} <= $${params.length}::date`);
    }
    if (service && col.service) {
      params.push(service);
      where.push(`${col.service} = $${params.length}`);
    }
    if (search && (col.name || col.phone)) {
      const parts = [];
      if (col.name)  { params.push(`%${search}%`);  parts.push(`${col.name} ILIKE $${params.length}`); }
      if (col.phone) { params.push(`%${search}%`);  parts.push(`${col.phone} ILIKE $${params.length}`); }
      if (parts.length) where.push(`(${parts.join(" OR ")})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // order preference
    const orderBy =
      col.created_at ? `${col.created_at} DESC`
      : col.date ? `${col.date} DESC`
      : col.order_id ? `${col.order_id} DESC`
      : "1";

    const query = `
      SELECT ${selectParts.join(", ")}
        FROM bookings
        ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1};
    `;
    params.push(limit);

    const rows = await sql(query, params);
    return json(200, { ok: true, rows });
  } catch (err) {
    return json(500, { ok: false, error: err.message || String(err) });
  }
};
