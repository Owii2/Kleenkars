import { neon } from "@netlify/neon";
import { json, requireAdmin } from "./_auth.js";
const sql = neon(process.env.NETLIFY_DATABASE_URL_UNPOOLED);

export default async (request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.res;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 200);

  const rows = await sql`
    SELECT id, name, phone, service, vehicle, datetime, created_at
    FROM bookings
    ORDER BY created_at DESC
    LIMIT ${limit};`;

  if (url.searchParams.get("csv") === "1") {
    const header = "id,name,phone,service,vehicle,datetime,created_at\n";
    const body = rows.map(r =>
      [r.id, r.name, r.phone, r.service, r.vehicle, r.datetime.toISOString(), r.created_at.toISOString()]
        .map(x => `"${String(x).replaceAll('"','""')}"`).join(",")
    ).join("\n");
    return new Response(header + body, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="bookings.csv"',
        "access-control-allow-origin": "*",
      }
    });
  }

  return json({ bookings: rows });
};
