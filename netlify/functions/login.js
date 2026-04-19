const { Client } = require("pg");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const { login, password } = JSON.parse(event.body);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized:false }
  });

  try {
    await client.connect();

    const result = await client.query(
      `SELECT id,name,role,password_hash,is_active
       FROM users
       WHERE username=$1 OR phone=$1
       LIMIT 1`,
      [login]
    );

    if (!result.rows.length) {
      return {
        statusCode:401,
        body:JSON.stringify({error:"Invalid login"})
      };
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return {
        statusCode:403,
        body:JSON.stringify({error:"Account suspended"})
      };
    }

    if (password !== user.password_hash) {
      return {
        statusCode:401,
        body:JSON.stringify({error:"Wrong password"})
      };
    }

    await client.query(
      `UPDATE users SET last_login=NOW() WHERE id=$1`,
      [user.id]
    );

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true,
        role:user.role,
        name:user.name
      })
    };

  } catch(e) {
    return {
      statusCode:500,
      body:JSON.stringify({error:e.message})
    };
  } finally {
    await client.end();
  }
};
