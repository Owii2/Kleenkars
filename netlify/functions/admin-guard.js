export async function handler(event) {
  const adminKey =
    event.headers["x-admin-key"] ||
    event.headers["X-Admin-Key"];

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return {
      statusCode: 401,
      body: "Unauthorized"
    };
  }

  return {
    statusCode: 200,
    body: "OK"
  };
}
