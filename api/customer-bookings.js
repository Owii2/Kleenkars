import { Client } from "pg";

export default async function handler(req,res){

const phone = req.query.phone;

const client = new Client({
connectionString: process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

const result = await client.query(
`SELECT created_at,service,vehicle,visit
 FROM bookings
 WHERE phone=$1
 ORDER BY created_at DESC`,
[phone]
);

res.status(200).json({rows:result.rows});

}catch(e){

res.status(500).json({error:e.message});

}finally{

await client.end();

}
}
