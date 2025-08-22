import crypto from "crypto";

export function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verify(token, secret) {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); }
  catch { return null; }
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

export async function requireAdmin(request) {
  const hdr = request.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
  const payload = verify(token, process.env.ADMIN_JWT_SECRET);
  if (!payload || payload.role !== "owner" || payload.exp < Date.now()) {
    return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  }
  return { ok: true, user: payload };
}
