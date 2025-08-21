import { neon } from '@netlify/neon';

// Using the env var you already have in Netlify (from your screenshot)
const sql = neon(process.env.NETLIFY_DATABASE_URL_UNPOOLED);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
  });
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { name, phone, service, vehicle, datetime } = await request.json();

    if (![name, phone, service, vehicle, datetime].every(Boolean)) {
      return json({ error: "Missing fields" }, 400);
    }

    const [booking] = await sql`
      INSERT INTO bookings (name, phone, service, vehicle, datetime)
      VALUES (${name}, ${phone}, ${service}, ${vehicle}, ${datetime})
      RETURNING *;
    `;

    return json({ success: true, booking });
  } catch (err) {
    console.error(err);
    return json({ error: "Database error" }, 500);
  }
};
