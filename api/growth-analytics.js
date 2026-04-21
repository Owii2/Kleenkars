import { Client } from "pg";

export default async function handler(req,res){

const client = new Client({
connectionString:process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

/* last 7 days revenue */
const revenue = await client.query(`
SELECT DATE(created_at) day,
COALESCE(SUM(price),0) revenue,
COUNT(*) bookings
FROM bookings
GROUP BY DATE(created_at)
ORDER BY day DESC
LIMIT 7
`);

/* repeat customers */
const repeat = await client.query(`
SELECT COUNT(*) total
FROM (
SELECT phone
FROM bookings
GROUP BY phone
HAVING COUNT(*) > 1
)x
`);

/* inactive 15 days */
const inactive = await client.query(`
SELECT name,phone,MAX(created_at) last_visit
FROM bookings
GROUP BY name,phone
HAVING MAX(created_at) < NOW() - INTERVAL '15 days'
ORDER BY last_visit DESC
LIMIT 50
`);

/* top spenders */
const vip = await client.query(`
SELECT name,phone,SUM(price) spend
FROM bookings
GROUP BY name,phone
ORDER BY spend DESC
LIMIT 10
`);

res.status(200).json({
revenue:revenue.rows,
repeat:repeat.rows[0].total,
inactive:inactive.rows,
vip:vip.rows
});

}catch(e){

res.status(500).json({error:e.message});

}finally{

await client.end();

}
}
