import { Client } from "pg";

export default async function handler(req,res){

const { username, type } = req.body;

const client = new Client({
connectionString: process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

/* Find employee */
const user = await client.query(
`SELECT id,name
 FROM users
 WHERE username=$1
 AND role='employee'
 LIMIT 1`,
[username]
);

if(!user.rows.length){
return res.status(404).json({
error:"Employee not found"
});
}

const employee = user.rows[0];

if(type === "IN"){

await client.query(
`INSERT INTO attendance
(id, employee_id, employee_name, check_in, status, created_at)
VALUES
(gen_random_uuid(), $1, $2, NOW(), 'Present', NOW())`,
[employee.id, employee.name]
);

return res.status(200).json({
success:true,
message:"Clock In marked"
});

}

if(type === "OUT"){

await client.query(
`UPDATE attendance
SET check_out = NOW(),
status = 'Completed'
WHERE employee_id = $1
AND check_out IS NULL`,
[employee.id]
);

return res.status(200).json({
success:true,
message:"Clock Out marked"
});

}

return res.status(400).json({
error:"Invalid type"
});

}catch(e){

return res.status(500).json({
error:e.message
});

}finally{

await client.end();

}
}
