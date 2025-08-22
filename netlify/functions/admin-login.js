// netlify/functions/admin-login.js
import jwt from "jsonwebtoken";

// Use env vars instead of hardcoded
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// Use a separate secret key for signing tokens
const JWT_SECRET = process.env.JWT_SECRET || "kleenkars-secret";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const { username, password } = JSON.parse(event.body || "{}");

    if (!username || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing credentials" })
      };
    }

    // Compare with env vars
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      // issue token
      const token = jwt.sign(
        { role: "admin", user: username },
        JWT_SECRET,
        { expiresIn: "2h" }
      );

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, token })
      };
    }

    return {
      statusCode: 401,
      body: JSON.stringify({ ok: false, error: "Invalid credentials" })
    };
  } catch (err) {
    console.error("admin-login error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "Server error" })
    };
  }
}
