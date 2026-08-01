import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {

  try {

    const {
      offerId,
      customerEmail
    } = await req.json();


    if(!offerId){
      return NextResponse.json(
        {
          success:false,
          error:"Offer ID is required"
        },
        {
          status:400
        }
      );
    }



    const tokenRes = await fetch(
      `${process.env.VESIM_BASE_URL}/api/auth/broker/token`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          email:process.env.VESIM_EMAIL,
          password:process.env.VESIM_PASSWORD
        })
      }
    );


    const tokenData = await tokenRes.json();



    const quoteRes = await fetch(
      `${process.env.VESIM_BASE_URL}/api/checkout/credit/quote`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":
          `Bearer ${tokenData.access_token}`
        },
        body:JSON.stringify({
          offerId,
          customerEmail
        })
      }
    );


    const quoteData = await quoteRes.json();


    console.log("QUOTE RESPONSE:", quoteData);


    return NextResponse.json(
      quoteData,
      {
        status:quoteRes.status
      }
    );


  } catch(error:any){

    return NextResponse.json(
      {
        success:false,
        error:error.message
      },
      {
        status:500
      }
    );

  }

}