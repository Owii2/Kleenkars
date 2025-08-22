// /netlify/functions/site-settings.js
import { neon } from "@netlify/neon";
import { json, requireAdmin } from "./_auth.js";
const sql = neon(process.env.NETLIFY_DATABASE_URL_UNPOOLED);

export default async (request) => {
  // Public read
  if (request.method === "GET") {
    const [row] = await sql`SELECT * FROM site_settings WHERE id = TRUE;`;
    return json({ settings: row || {} });
  }

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
      },
    });
  }

  // Write requires admin
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.res;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const primary = body.primary_color ?? null;
    const accent  = body.accent_color ?? null;
    const text    = body.text_color ?? null;
    const hero    = body.hero_image ?? null;
    const gallery = Array.isArray(body.gallery) ? JSON.stringify(body.gallery) : null;
    const tagline = body.tagline ?? null;

    const [updated] = await sql`
      UPDATE site_settings
      SET primary_color = COALESCE(${primary}, primary_color),
          accent_color  = COALESCE(${accent},  accent_color),
          text_color    = COALESCE(${text},    text_color),
          hero_image    = COALESCE(${hero},    hero_image),
          gallery_json  = COALESCE(${gallery}, gallery_json),
          tagline       = COALESCE(${tagline}, tagline),
          updated_at    = NOW()
      WHERE id = TRUE
      RETURNING *;`;

    return json({ ok: true, settings: updated });
  } catch (e) {
    console.error(e);
    return json({ error: "Settings update failed" }, 500);
  }
};
