// netlify/functions/admin-bookings-probe.js
import { neon } from "@netlify/neon";

const json = (s, b) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  body: JSON.stringify(b, null, 2),
});

export const handler = async () => {
  try {
    if (!process.env.DATABASE_URL) return json(500, { ok:false, error:"DATABASE_URL missing" });
    const sql = neon(process.env.DATABASE_URL);

    const tables = await sql(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('bookings','services')
      ORDER BY table_name
    `);

    const info = { tables };

    if (tables.some(t => t.table_name === 'bookings')) {
      info.booking_columns = await sql(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'bookings'
        ORDER BY ordinal_position
      `);
      info.sample_rows = await sql(`SELECT * FROM bookings ORDER BY 1 DESC LIMIT 3`);
      info.count = (await sql(`SELECT COUNT(*)::int AS c FROM bookings`))[0]?.c ?? 0;
    }

    return json(200, { ok:true, info });
  } catch (e) {
    return json(500, { ok:false, error:e.message });
  }
};
