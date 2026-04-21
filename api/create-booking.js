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

    const {
      name,
      phone,
      service,
      vehicle,
      price,
      address
    } = req.body;

    const result = await client.query(
      `INSERT INTO bookings
      (name, phone, service, vehicle, datetime, created_at, price, visit, address)
      VALUES
      ($1,$2,$3,$4,NOW(),NOW(),$5,'New',$6)
      RETURNING *`,
      [
        name || '',
        phone || '',
        service || '',
        vehicle || '',
        Number(price || 0),
        address || ''
      ]
    );

    return res.status(200).json({
      success: true,
      booking: result.rows[0]
    });

  } catch (e) {

    return res.status(500).json({
      error: e.message
    });

  } finally {

    await client.end();

  }
}
