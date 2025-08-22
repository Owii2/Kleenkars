// netlify/functions/admin-login.js
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { user, pass } = JSON.parse(event.body || "{}");

    const ADMIN_USER = process.env.ADMIN_USER || "admin";
    const ADMIN_PASS = process.env.ADMIN_PASS || "password";

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      // Create a simple token (base64 encoded user + timestamp)
      const token = Buffer.from(`${user}:${Date.now()}`).toString("base64");
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, token })
      };
    } else {
      return {
        statusCode: 401,
        body: JSON.stringify({ ok: false, error: "Invalid credentials" })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}
