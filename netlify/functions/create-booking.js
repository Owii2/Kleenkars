const { Client } = require("pg");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Use POST request to create booking"
      })
    };
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const data = JSON.parse(event.body);

    await client.connect();

    const result = await client.query(
      `INSERT INTO bookings
      (name, phone, service, vehicle, datetime, created_at, price, visit, address)
      VALUES ($1,$2,$3,$4,NOW(),NOW(),$5,$6,$7)
      RETURNING *`,
      [
        data.name,
        data.phone,
        data.service,
        data.vehicle,
        data.price || 0,
        "New",
        data.address || ""
      ]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        booking: result.rows[0]
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };

  } finally {
    await client.end();
  }
};
