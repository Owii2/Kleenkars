import { Client } from "pg";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { login, password } = req.body;

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {

    await client.connect();

    const result = await client.query(
      `SELECT id,name,role,password_hash,is_active
       FROM users
       WHERE phone=$1 OR username=$1
       LIMIT 1`,
      [login]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        error: "Invalid login"
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        error: "Account suspended"
      });
    }

    if (password !== user.password_hash) {
      return res.status(401).json({
        error: "Wrong password"
      });
    }

    return res.status(200).json({
      success: true,
      role: user.role,
      name: user.name
    });

  } catch (e) {

    return res.status(500).json({
      error: e.message
    });

  } finally {

    await client.end();

  }
}
