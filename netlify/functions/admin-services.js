import { neon } from "@netlify/neon";
import { json, requireAdmin } from "./_auth.js";
const sql = neon(process.env.NETLIFY_DATABASE_URL_UNPOOLED);

export default async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
      },
    });
  }

  if (request.method === "GET") {
    const rows = await sql`SELECT * FROM services WHERE active = TRUE ORDER BY vehicle_type, price, id;`;
    return json({ services: rows });
  }

  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.res;

  try {
    if (request.method === "POST") {
      const { name, vehicle_type, price, active = true } = await request.json();
      const [row] = await sql`
        INSERT INTO services (name, vehicle_type, price, active)
        VALUES (${name}, ${vehicle_type}, ${price}, ${active})
        RETURNING *;`;
      return json({ ok: true, service: row });
    }

    if (request.method === "PUT") {
      const { id, name, vehicle_type, price, active } = await request.json();
      const [row] = await sql`
        UPDATE services
        SET name = COALESCE(${name}, name),
            vehicle_type = COALESCE(${vehicle_type}, vehicle_type),
            price = COALESCE(${price}, price),
            active = COALESCE(${active}, active)
        WHERE id = ${id}
        RETURNING *;`;
      return json({ ok: true, service: row });
    }

    if (request.method === "DELETE") {
      const { id } = await request.json();
      await sql`DELETE FROM services WHERE id = ${id};`;
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "DB error" }, 500);
  }
};
