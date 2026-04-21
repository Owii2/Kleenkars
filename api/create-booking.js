import { Client } from "pg";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {

    await client.connect();

    const data = req.body || {};

    const result = await client.query(
      `INSERT INTO bookings
      (name, phone, service, vehicle)
      VALUES ($1,$2,$3,$4)
      RETURNING *`,
      [
        data.name || '',
        data.phone || '',
        data.service || '',
        data.vehicle || ''
      ]
    );

    return res.status(200).json({
      success: true,
      booking: result.rows[0]
    });

  } catch (e) {

    return res.status(500).json({
      error: e.message,
      detail: e.detail || null,
      code: e.code || null,
      table: e.table || null,
      column: e.column || null
    });

  } finally {

    await client.end();

  }
}
