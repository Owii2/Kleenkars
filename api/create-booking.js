import { Client } from "pg";

export default async function handler(req,res){

if(req.method !== "POST"){
return res.status(405).json({error:"Method not allowed"});
}

const client = new Client({
connectionString: process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

const db = await client.query("SELECT NOW()");

return res.status(200).json({
success:true,
db:"connected",
time:db.rows[0]
});

}catch(e){

return res.status(500).json({
error:e.message,
name:e.name,
code:e.code || null
});

}finally{

await client.end().catch(()=>{});

}
}
