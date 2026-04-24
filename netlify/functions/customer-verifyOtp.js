import { issueCustomerToken, normPhone, verifyOtp } from "./_otp.js";

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
    const otp = String(body.otp || "").replace(/\D/g, "").slice(0, 6);

    if (!phone || !otp) return json(400, { ok:false, error:"Missing phone/otp" });

    const out = await verifyOtp({ phone, purpose, otp });
    if (!out.ok) return json(out.statusCode || 401, { ok:false, error: out.error });

    const token = issueCustomerToken({ phone });
    return json(200, { ok:true, token, expiresIn:"10m" });
  }catch(err){
    return json(500, { ok:false, error: err.message });
  }
}
