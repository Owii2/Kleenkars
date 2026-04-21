import { Client } from "pg";

export default async function handler(req,res){

const client = new Client({
connectionString: process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

/* Today's bookings */
const bookings = await client.query(
`SELECT COUNT(*) AS total
 FROM bookings
 WHERE DATE(created_at)=CURRENT_DATE`
);

/* Today's revenue */
const revenue = await client.query(
`SELECT COALESCE(SUM(price),0) AS total
 FROM bookings
 WHERE DATE(created_at)=CURRENT_DATE`
);

/* Staff present */
const staff = await client.query(
`SELECT COUNT(DISTINCT employee_id) AS total
 FROM attendance
 WHERE DATE(created_at)=CURRENT_DATE`
);

/* Recent bookings */
const recent = await client.query(
`SELECT id,name,service,vehicle,price,visit,created_at
 FROM bookings
 ORDER BY created_at DESC
 LIMIT 10`
);

/* Attendance log */
const logs = await client.query(
`SELECT employee_name,status,check_in,check_out
 FROM attendance
 ORDER BY created_at DESC
 LIMIT 10`
);

 const perf = await client.query(
`SELECT employee_name,
COUNT(*) AS days_present
FROM attendance
GROUP BY employee_name
ORDER BY COUNT(*) DESC
LIMIT 5`
);
 
res.status(200).json({
bookings: bookings.rows[0].total,
revenue: revenue.rows[0].total,
staff: staff.rows[0].total,
recent: recent.rows,
logs: logs.rows
});

}catch(e){

res.status(500).json({error:e.message});

}finally{

await client.end();

}
}
