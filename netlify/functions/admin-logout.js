// netlify/functions/admin-logout.js
export default async () => {
  const cookie = [
    "kk_admin=",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0"
  ].join("; ");

  return {
    statusCode: 200,
    headers: { "Set-Cookie": cookie, "Content-Type":"application/json" },
    body: JSON.stringify({ ok:true })
  };
};
