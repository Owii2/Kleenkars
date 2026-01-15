import pool from './db.js';

export const handler = async (event) => {
  try {
    const { customer_id, plan_id } = JSON.parse(event.body);

    const planRes = await pool.query(
      `SELECT validity_days, total_washes FROM plans WHERE id = $1`,
      [plan_id]
    );

    const plan = planRes.rows[0];

    const membershipRes = await pool.query(
      `INSERT INTO memberships
       (customer_id, plan_id, expiry_date, remaining_washes)
       VALUES (
         $1,
         $2,
         CURRENT_DATE + $3 * INTERVAL '1 day',
         $4
       )
       RETURNING *`,
      [customer_id, plan_id, plan.validity_days, plan.total_washes]
    );

    return {
      statusCode: 200,
      body: JSON.stringify(membershipRes.rows[0])
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};
