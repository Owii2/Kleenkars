import pool from './db.js';

export const handler = async (event) => {
  try {
    const { membership_id } = JSON.parse(event.body);

    const res = await pool.query(
      `UPDATE memberships
       SET remaining_washes = remaining_washes - 1
       WHERE id = $1 AND remaining_washes > 0
       RETURNING *`,
      [membership_id]
    );

    if (res.rowCount === 0) {
      throw new Error('No washes remaining');
    }

    return {
      statusCode: 200,
      body: JSON.stringify(res.rows[0])
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};
