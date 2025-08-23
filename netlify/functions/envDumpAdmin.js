// netlify/functions/envDumpAdmin.js
export const handler = async () => {
  const pick = (k) => {
    const v = process.env[k];
    return { present: !!v, length: v ? String(v).length : 0 };
  };
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      ok: true,
      vars: {
        ADMIN_USER: pick("ADMIN_USER"),
        ADMIN_PASS: pick("ADMIN_PASS"),
        ADMIN_PASSWORD: pick("ADMIN_PASSWORD"),
        ADMIN_JWT_SECRET: pick("ADMIN_JWT_SECRET"),
        DATABASE_URL: pick("DATABASE_URL")
      }
    })
  };
};
