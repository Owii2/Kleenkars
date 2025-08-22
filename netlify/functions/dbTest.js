// netlify/functions/dbTest.js
import { pool, dbInfo } from "./_db.js";

export async function handler() {
  try {
    const r = await pool.query("select now() as server_time");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, server_time: r.rows[0].server_time, used_env_key: dbInfo.usedKey })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
}
