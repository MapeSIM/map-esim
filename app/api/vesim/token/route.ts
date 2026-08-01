import { NextResponse } from "next/server";

export async function GET(){

  const res = await fetch(
    `${process.env.VESIM_BASE_URL}/api/auth/broker/token`,
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Accept:"application/json"
      },
      body:JSON.stringify({
        email:process.env.VESIM_EMAIL,
        password:process.env.VESIM_PASSWORD
      }),
      cache:"no-store"
    }
  );


  const data = await res.json();


  console.log("NEW TOKEN RESPONSE:", data);


  return NextResponse.json(data);

}