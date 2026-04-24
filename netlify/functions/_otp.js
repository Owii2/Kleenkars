import crypto from "crypto";
import { neon, neonConfig } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";

neonConfig.fetchConnectionCache = true;

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function db() {
  return neon(process.env.DATABASE_URL);
}

function otpSecret() {
  return process.env.CUSTOMER_OTP_SECRET || process.env.ADMIN_JWT_SECRET || "";
}

function customerJwtSecret() {
  return process.env.CUSTOMER_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "";
}

function hashOtp(phone, purpose, otp, nonce) {
  return crypto
    .createHmac("sha256", otpSecret())
    .update(`${phone}:${purpose}:${otp}:${nonce}`)
    .digest("base64url");
}

export function normPhone(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 15);
}

export async function ensureOtpSchema(sql = db()) {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_otps (
      id BIGSERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      nonce TEXT NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      consumed BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_customer_otps_phone_purpose ON customer_otps(phone, purpose, created_at DESC)`;
}

export async function issueOtp({ phone, purpose }) {
  const sql = db();
  await ensureOtpSchema(sql);

  const nowRow = await sql`SELECT NOW() AS now_ts`;
  const nowTs = nowRow[0].now_ts;

  const recent = await sql`
    SELECT created_at
    FROM customer_otps
    WHERE phone=${phone} AND purpose=${purpose}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (recent.length) {
    const seconds = await sql`
      SELECT EXTRACT(EPOCH FROM (${nowTs}::timestamp - ${recent[0].created_at}::timestamp))::int AS diff
    `;
    const diff = Number(seconds[0].diff || 0);
    if (diff < RESEND_COOLDOWN_SECONDS) {
      return { ok: false, statusCode: 429, error: `Please wait ${RESEND_COOLDOWN_SECONDS - diff}s before requesting another OTP` };
    }
  }

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const nonce = crypto.randomBytes(8).toString("hex");
  const otp_hash = hashOtp(phone, purpose, otp, nonce);

  await sql`
    INSERT INTO customer_otps (phone, purpose, otp_hash, nonce, attempts, consumed, expires_at, created_at, last_sent_at)
    VALUES (
      ${phone}, ${purpose}, ${otp_hash}, ${nonce}, 0, FALSE,
      NOW() + (${OTP_TTL_SECONDS} || ' seconds')::interval,
      NOW(), NOW()
    )
  `;

  return { ok: true, otp, ttlSeconds: OTP_TTL_SECONDS };
}

export async function verifyOtp({ phone, purpose, otp }) {
  const sql = db();
  await ensureOtpSchema(sql);

  const rows = await sql`
    SELECT id, otp_hash, nonce, attempts, consumed, expires_at
    FROM customer_otps
    WHERE phone=${phone} AND purpose=${purpose}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!rows.length) return { ok: false, statusCode: 401, error: "OTP not found" };

  const row = rows[0];
  if (row.consumed) return { ok: false, statusCode: 401, error: "OTP already used" };

  const expRows = await sql`SELECT NOW() > ${row.expires_at}::timestamp AS expired`;
  if (expRows[0].expired) return { ok: false, statusCode: 401, error: "OTP expired" };

  const attempts = Number(row.attempts || 0);
  if (attempts >= MAX_ATTEMPTS) {
    return { ok: false, statusCode: 429, error: "Too many attempts" };
  }

  const expected = hashOtp(phone, purpose, otp, row.nonce);
  if (expected !== row.otp_hash) {
    await sql`UPDATE customer_otps SET attempts = attempts + 1 WHERE id=${row.id}`;
    return { ok: false, statusCode: 401, error: "Invalid OTP" };
  }

  await sql`UPDATE customer_otps SET consumed = TRUE WHERE id=${row.id}`;
  return { ok: true };
}

export function issueCustomerToken({ phone }) {
  const secret = customerJwtSecret();
  if (!secret) {
    throw new Error("CUSTOMER_JWT_SECRET or ADMIN_JWT_SECRET is required for customer tokens");
  }
  return jwt.sign({ role: "customer", phone }, secret, { expiresIn: "10m" });
}

export function verifyCustomerToken(token, phone) {
  const secret = customerJwtSecret();
  if (!secret || !token) return false;
  try {
    const payload = jwt.verify(token, secret);
    return payload?.role === "customer" && payload?.phone === phone;
  } catch {
    return false;
  }
}
