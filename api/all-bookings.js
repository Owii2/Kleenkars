import { Client } from "pg";

export default async function handler(req,res){

const client = new Client({
connectionString:process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

const q = req.query.q || "";
const status = req.query.status || "";

let sql = `
SELECT id,name,phone,service,vehicle,price,visit
FROM bookings
WHERE (name ILIKE $1 OR phone ILIKE $1)
`;

let params = ['%'+q+'%'];

if(status){
sql += ` AND visit=$2`;
params.push(status);
}

sql += ` ORDER BY created_at DESC LIMIT 50`;

const result = await client.query(sql,params);

res.status(200).json({rows:result.rows});

}catch(e){

res.status(500).json({error:e.message});

}finally{

await client.end();

}
}
