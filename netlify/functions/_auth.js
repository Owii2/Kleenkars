import jwt from "jsonwebtoken";

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET || "";
  if (!secret) throw new Error("ADMIN_JWT_SECRET missing");
  return secret;
}

function normalizeHeaders(headersLike) {
  if (!headersLike) return {};
  if (typeof headersLike.get === "function") {
    const auth = headersLike.get("authorization") || headersLike.get("Authorization") || "";
    return { authorization: auth };
  }
  return headersLike;
}

export function extractBearer(headersLike) {
  const headers = normalizeHeaders(headersLike);
  const raw = headers.authorization || headers.Authorization || "";
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

export function verifyJwt(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getSecret());
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
}

export function hasRole(payload, allowedRoles = ["admin", "owner"]) {
  return !!payload && allowedRoles.includes(payload.role);
}

export function requireRoleFromEvent(event, allowedRoles = ["admin", "owner"]) {
  const token = extractBearer(event?.headers);
  const payload = verifyJwt(token);
  if (!hasRole(payload, allowedRoles)) return null;
  return payload;
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
  });
}

export async function requireRole(request, allowedRoles = ["admin", "owner"]) {
  const token = extractBearer(request?.headers);
  const payload = verifyJwt(token);

  if (!hasRole(payload, allowedRoles)) {
    return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  }

  return { ok: true, user: payload };
}

export const requireAdmin = (request) => requireRole(request, ["admin", "owner"]);
