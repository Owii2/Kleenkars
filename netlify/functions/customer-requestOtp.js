import { issueOtp, normPhone } from "./_otp.js";

function json(status, obj){
  return {
    statusCode: status,
    headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" },
    body: JSON.stringify(obj),
  };
}

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return json(204, { ok:true });
  if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

  try{
    const body = JSON.parse(event.body || "{}");
    const phone = normPhone(body.phone);
    const purpose = String(body.purpose || "manage_booking").trim().slice(0, 50);

    if (!phone) return json(400, { ok:false, error:"Missing phone" });

    const out = await issueOtp({ phone, purpose });
    if (!out.ok) return json(out.statusCode || 400, { ok:false, error: out.error });

    const response = {
      ok:true,
      message:"OTP issued",
      ttlSeconds: out.ttlSeconds,
    };

    if (process.env.NODE_ENV !== "production") {
      response.devOtp = out.otp;
    }

    return json(200, response);
  }catch(err){
    return json(500, { ok:false, error: err.message });
  }
}
