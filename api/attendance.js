import { Client } from "pg";

export default async function handler(req,res){

const { username, type } = req.body;

const client = new Client({
connectionString: process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

await client.query(
`INSERT INTO attendance
(username,status,created_at)
VALUES($1,$2,NOW())`,
[username,type]
);

res.status(200).json({
success:true,
message:"Marked " + type
});

}catch(e){

res.status(500).json({error:e.message});

}finally{

await client.end();

}
}
