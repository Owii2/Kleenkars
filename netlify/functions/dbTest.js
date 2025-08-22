// netlify/functions/dbTest.js
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function handler() {
  try {
    const r = await pool.query("select now() as server_time");
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, server_time: r.rows[0].server_time })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}
