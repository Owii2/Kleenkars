// netlify/functions/admin-login.js
// Simple, dependency-free admin login using env vars and a base64 token.

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Accept either {user, pass} or {username, password}
    const username = body.user ?? body.username ?? "";
    const password = body.pass ?? body.password ?? "";

    const ADMIN_USER = process.env.ADMIN_USER || "admin";
    const ADMIN_PASS = process.env.ADMIN_PASS || "kleenkars123";

    if (!username || !password) {
      return json(400, { ok: false, error: "Missing credentials" });
    }

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      // Create a simple token (base64 of user + timestamp + random)
      const raw = `${username}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const token = Buffer.from(raw).toString("base64");
      return json(200, { ok: true, token });
    }

    return json(401, { ok: false, error: "Invalid credentials" });
  } catch (err) {
    console.error("admin-login error:", err);
    return json(500, { ok: false, error: "Server error" });
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
