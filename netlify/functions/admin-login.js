import { json, sign } from "./_auth.js";

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { password } = await request.json().catch(() => ({}));
  if (!password) return json({ error: "Missing password" }, 400);
  if (password !== process.env.ADMIN_PASSWORD) return json({ error: "Invalid password" }, 401);

  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const token = sign({ role: "owner", exp }, process.env.ADMIN_JWT_SECRET);
  return json({ token });
};
