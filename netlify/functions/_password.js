import crypto from "crypto";

const KEYLEN = 64;
const DIGEST = "sha256";
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;

function parseHash(stored) {
  const raw = String(stored || "").trim();
  if (!raw) return null;
  const parts = raw.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt") return null;

  const [, nStr, rStr, pStr, saltB64, hashB64, digest] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return null;
  if (!saltB64 || !hashB64) return null;

  return {
    n,
    r,
    p,
    salt: Buffer.from(saltB64, "base64url"),
    hash: Buffer.from(hashB64, "base64url"),
    digest: digest || DIGEST,
  };
}

export function hashPassword(password, opts = {}) {
  const plain = String(password || "");
  if (plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const n = opts.n || DEFAULT_N;
  const r = opts.r || DEFAULT_R;
  const p = opts.p || DEFAULT_P;
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, KEYLEN, { N: n, r, p, maxmem: 128 * n * r * 2 });

  return [
    "scrypt",
    String(n),
    String(r),
    String(p),
    salt.toString("base64url"),
    derived.toString("base64url"),
    DIGEST,
  ].join("$");
}

export function verifyPassword(password, storedHash) {
  const plain = String(password || "");
  const parsed = parseHash(storedHash);

  if (!parsed) {
    return plain === String(storedHash || "");
  }

  const test = crypto.scryptSync(plain, parsed.salt, parsed.hash.length, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
    maxmem: 128 * parsed.n * parsed.r * 2,
  });

  if (test.length !== parsed.hash.length) return false;
  return crypto.timingSafeEqual(test, parsed.hash);
}

export function needsRehash(storedHash) {
  const parsed = parseHash(storedHash);
  if (!parsed) return true;
  return parsed.n !== DEFAULT_N || parsed.r !== DEFAULT_R || parsed.p !== DEFAULT_P;
}
