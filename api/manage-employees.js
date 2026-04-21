import { Client } from "pg";

export default async function handler(req,res){

const client = new Client({
connectionString: process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

const { action } = req.body;

/* CREATE EMPLOYEE */
if(action === "create"){

const {
name,
phone,
username,
password,
role
} = req.body;

await client.query(
`INSERT INTO users
(id,name,phone,username,role,password_hash,is_active,created_at)
VALUES
(gen_random_uuid(),$1,$2,$3,$4,$5,true,NOW())`,
[name,phone,username,role,password]
);

return res.status(200).json({
success:true,
message:"Employee created"
});
}

/* SUSPEND */
if(action === "suspend"){

await client.query(
`UPDATE users
 SET is_active=false
 WHERE username=$1`,
[req.body.username]
);

return res.status(200).json({
success:true,
message:"Employee suspended"
});
}

/* ACTIVATE */
if(action === "activate"){

await client.query(
`UPDATE users
 SET is_active=true
 WHERE username=$1`,
[req.body.username]
);

return res.status(200).json({
success:true,
message:"Employee activated"
});
}

return res.status(400).json({
error:"Invalid action"
});

}catch(e){

return res.status(500).json({
error:e.message
});

}finally{

await client.end();

}
}
