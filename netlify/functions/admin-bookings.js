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
  try { return jwt.verify(m[1], process.env.ADMIN_JWT_SECRET); } catch { return null; }
}

const qsVal = (qs, k) => (qs?.[k] ?? "").toString().trim();

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  try {
    assertEnv();

    // Require admin token
    const claims = authz(event);
    if (!claims) return json(401, { ok: false, error: "Unauthorized" });

    const sql = neon(process.env.DATABASE_URL);

    // --- detect columns on bookings
    const cols = await sql(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'bookings'
    `);
    const set = new Set(cols.map(r => r.column_name));
    const has = (c) => set.has(c);
    const pick = (...cands) => cands.find(c => has(c));

    // mapping
    const col = {
      order_id: pick("order_id","id"),
      name: pick("name"),
      phone: pick("phone"),
      vehicle: pick("vehicle","vehicle_type"),
      service: pick("service","service_name"),
      date: pick("date","booking_date"),
      time: pick("time","booking_time"),
      datetime: pick("datetime"),
      visit: pick("visit","visit_type"),
      address: pick("address","location"),
      price: pick("price","amount","total"),
      created_at: pick("created_at","created","inserted_at"),
    };

    // --- build SELECT list with fallbacks:
    //  - date/time: derive from datetime in Asia/Kolkata if separate cols not present
    //  - visit: default to 'Wash Center' if absent
    //  - price: if no price col, extract first integer from service text
    const selectParts = [];
    const pushSel = (db, alias, cast=null) => {
      if (db) selectParts.push(`${db}${cast?`::${cast}`:""} AS ${alias}`);
      else selectParts.push(`NULL AS ${alias}`);
    };

    // id → order_id
    if (col.order_id) selectParts.push(`${col.order_id} AS order_id`); else selectParts.push(`NULL AS order_id`);

    pushSel(col.name, "name");
    pushSel(col.phone, "phone");
    pushSel(col.vehicle, "vehicle");
    pushSel(col.service, "service");

    // date
    if (!col.date && col.datetime) {
      selectParts.push(`to_char(${col.datetime} AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS date`);
    } else {
      pushSel(col.date, "date");
    }

    // time
    if (!col.time && col.datetime) {
      selectParts.push(`to_char(${col.datetime} AT TIME ZONE 'Asia/Kolkata','HH24:MI') AS time`);
    } else {
      pushSel(col.time, "time");
    }

    // visit: default
    if (col.visit) {
      pushSel(col.visit, "visit");
    } else {
      selectParts.push(`'Wash Center'::text AS visit`);
    }

    // address
    pushSel(col.address, "address");

    // price: use column if present; else parse digits from service
    if (col.price) {
      // normalize to integer if it's stored as text
      selectParts.push(`${col.price}::int AS price`);
    } else if (col.service) {
      // extract first group of digits from the service string, else NULL
      // works for "Basic Car Wash - ₹150" or "â‚¹150"
      selectParts.push(`
        CASE
          WHEN ${col.service} ~ '\\\\d'
          THEN NULLIF(regexp_replace(${col.service}, '.*?(\\\\d+).*', '\\\\1'), '')::int
          ELSE NULL
        END AS price
      `);
    } else {
      selectParts.push(`NULL::int AS price`);
    }

    pushSel(col.created_at, "created_at");

    // --- filters
    const qs = event.queryStringParameters || {};
    const from   = qsVal(qs, "from");   // YYYY-MM-DD
    const to     = qsVal(qs, "to");     // YYYY-MM-DD
    const svc    = qsVal(qs, "service");
    const search = qsVal(qs, "search");
    const limit  = Math.min(1000, Math.max(1, parseInt(qsVal(qs, "limit") || "500", 10)));

    const where = [];
    const params = [];

    // prefer date column; else use datetime
    if (from) {
      if (col.date)      { params.push(from); where.push(`${col.date} >= $${params.length}::date`); }
      else if (col.datetime) { params.push(from); where.push(`${col.datetime} >= $${params.length}::date`); }
    }
    if (to) {
      if (col.date)      { params.push(to); where.push(`${col.date} <= $${params.length}::date`); }
      else if (col.datetime) { params.push(to); where.push(`${col.datetime} < ($${params.length}::date + INTERVAL '1 day')`); }
    }
    if (svc && col.service) { params.push(svc); where.push(`${col.service} = $${params.length}`); }
    if (search && (col.name || col.phone)) {
      const parts = [];
      if (col.name)  { params.push(`%${search}%`);  parts.push(`${col.name} ILIKE $${params.length}`); }
      if (col.phone) { params.push(`%${search}%`);  parts.push(`${col.phone} ILIKE $${params.length}`); }
      if (parts.length) where.push(`(${parts.join(" OR ")})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const orderBy =
      col.created_at ? `${col.created_at} DESC`
      : col.datetime  ? `${col.datetime} DESC`
      : col.date      ? `${col.date} DESC`
      : col.order_id  ? `${col.order_id} DESC`
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
