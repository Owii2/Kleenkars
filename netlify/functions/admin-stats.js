import { neon } from "@netlify/neon";
import { json, requireAdmin } from "./_auth.js";
const sql = neon(process.env.NETLIFY_DATABASE_URL_UNPOOLED);

// Adjust to your real costs
const COST_RATIO = 0.35;

export default async (request) => {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.res;

  const extractPrice = (t) => {
    const m = /₹?\s*([0-9]+)/.exec(t || "");
    return m ? Number(m[1]) : 0;
  };

  const rows = await sql`SELECT service, datetime FROM bookings;`;
  const now = new Date();
  const yr = now.getUTCFullYear();

  let revYTD = 0, cntYTD = 0, rev30 = 0, cnt30 = 0;
  for (const r of rows) {
    const p = extractPrice(r.service);
    const d = new Date(r.datetime);
    if (d.getUTCFullYear() === yr) { revYTD += p; cntYTD++; }
    if ((now - d) / 86400000 <= 30) { rev30 += p; cnt30++; }
  }

  const avgDay30 = rev30 / 30;
  const startNext = Date.UTC(yr + 1, 0, 1);
  const todayUTC = Date.UTC(yr, now.getUTCMonth(), now.getUTCDate());
  const daysRemain = Math.ceil((startNext - todayUTC) / 86400000);
  const projRevenue = Math.round(revYTD + avgDay30 * Math.max(0, daysRemain));

  const costsYTD = Math.round(revYTD * COST_RATIO);
  const profitYTD = revYTD - costsYTD;
  const projCosts = Math.round(projRevenue * COST_RATIO);
  const projProfit = projRevenue - projCosts;

  return json({
    year: yr,
    ytd: { orders: cntYTD, revenue: revYTD, costs: costsYTD, profit: profitYTD },
    last30: { orders: cnt30, revenue: rev30, avg_daily_revenue: Math.round(avgDay30) },
    projection: { revenue: projRevenue, costs: projCosts, profit: projProfit, cost_ratio: COST_RATIO }
  });
};
