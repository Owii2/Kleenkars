import { Client } from "pg";
import { verifyPassword, hashPassword, needsRehash } from "../netlify/functions/_password.js";

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
      return res.status(401).json({ error: "Invalid login" });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: "Account suspended" });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Wrong password" });
    }

    if (needsRehash(user.password_hash)) {
      const upgradedHash = hashPassword(password);
      await client.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [upgradedHash, user.id]);
    }

    return res.status(200).json({
      success: true,
      role: user.role,
      name: user.name
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  } finally {
    await client.end();
  }
}
