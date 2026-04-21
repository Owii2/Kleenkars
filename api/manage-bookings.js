import { Client } from "pg";

export default async function handler(req,res){

const client = new Client({
connectionString: process.env.DATABASE_URL,
ssl:{rejectUnauthorized:false}
});

try{

await client.connect();

const { action,id,price,service } = req.body;

/* COMPLETE */
if(action==="complete"){

await client.query(
`UPDATE bookings
 SET visit='Completed'
 WHERE id=$1`,
[id]
);

return res.status(200).json({
success:true,
message:"Booking completed"
});
}

/* EDIT */
if(action==="edit"){

await client.query(
`UPDATE bookings
 SET price=$1,
 service=$2
 WHERE id=$3`,
[price,service,id]
);

return res.status(200).json({
success:true,
message:"Booking updated"
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
