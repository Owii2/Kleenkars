// netlify/functions/_modcheck.js
import { neon } from "@netlify/neon";
import jwt from "jsonwebtoken";

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(body, null, 2),
});

export const handler = async () => {
  try {
    return json(200, {
      ok: true,
      neonPresent: typeof neon === "function",
      jwtPresent: typeof jwt?.sign === "function",
      node: process.version
    });
  } catch (e) {
    return json(500, { ok: false, error: e.message });
  }
};
