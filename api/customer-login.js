import { Client } from "pg";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: "Phone required" });
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {

    await client.connect();

    let user = await client.query(
      `SELECT id,name,role,phone
       FROM users
       WHERE phone=$1
       LIMIT 1`,
      [phone]
    );

    if (!user.rows.length) {

      await client.query(
        `INSERT INTO users
        (id,name,phone,role,password_hash,is_active,created_at)
        VALUES
        (gen_random_uuid(),$1,$2,'customer','',true,NOW())`,
        ['Customer', phone]
      );

      user = await client.query(
        `SELECT id,name,role,phone
         FROM users
         WHERE phone=$1
         LIMIT 1`,
        [phone]
      );
    }

    return res.status(200).json({
      success: true,
      role: "customer",
      phone: user.rows[0].phone
    });

  } catch (e) {

    return res.status(500).json({
      error: e.message
    });

  } finally {

    await client.end();

  }
}
