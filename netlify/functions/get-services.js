const { Client } = require("pg");

exports.handler = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const result = await client.query(`
      SELECT id, name, vehicle_type, price, category, duration_minutes, description
      FROM services
      WHERE active = true
      ORDER BY id ASC
    `);

    return {
      statusCode: 200,
      body: JSON.stringify(result.rows)
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
