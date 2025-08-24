// netlify/functions/admin-uploadHero.js
import { Buffer } from "buffer";
import jwt from "jsonwebtoken";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  // Auth (same as other admin APIs)
  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Unauthorized" }) };
  }

  try {
    // Decode incoming body (base64)
    const body = JSON.parse(event.body || "{}");
    const { imageBase64 } = body;
    if (!imageBase64) throw new Error("Missing imageBase64");

    // Convert base64 → buffer
    const buffer = Buffer.from(imageBase64, "base64");

    // Here you’d normally store the file in a storage provider
    // For Netlify, simplest is to use Netlify Large Media OR an external S3 bucket.
    // Placeholder: Just return success and "pretend" saved
    // (You’ll replace this with real storage)
    console.log("Uploaded hero.jpg, size:", buffer.length);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, message: "Hero image updated!" })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
}
