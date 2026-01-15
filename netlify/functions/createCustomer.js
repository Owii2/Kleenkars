import pool from './db.js';

export const handler = async (event) => {
  try {
    const { name, phone, email, vehicle_number, vehicle_type } = JSON.parse(event.body);

    const result = await pool.query(
      `INSERT INTO customers (name, phone, email, vehicle_number, vehicle_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, phone, email, vehicle_number, vehicle_type]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(result.rows[0])
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};
