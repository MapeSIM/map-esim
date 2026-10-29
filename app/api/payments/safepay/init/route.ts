import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { offerId, customerEmail } = body;

    const baseAmountUSD = 0.99; 
    const feePercentage = 0.08; 
    const finalUSD = baseAmountUSD * (1 + feePercentage);

    const environment = process.env.SAFEPAY_ENVIRONMENT || 'sandbox';
    const apiKey = process.env.SAFEPAY_API_KEY;
    const secretKey = process.env.SAFEPAY_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return NextResponse.json({ success: false, error: "Safepay keys are missing from server" }, { status: 500 });
    }

    const apiUrl = environment === 'sandbox' 
      ? 'https://sandbox.api.getsafepay.com' 
      : 'https://api.getsafepay.com';

    const calculatedAmount = Math.round(finalUSD * 100);
    const origin = req.headers.get("origin") || "https://mapesim.com";

    console.log("Initializing Safepay Tracker (Without Cybersource intent)...");

    const trackerResponse = await fetch(`${apiUrl}/order/v1/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SFPY-MERCHANT-SECRET': secretKey
      },
      body: JSON.stringify({
        client: apiKey,
        environment: environment,
        amount: calculatedAmount,
        currency: 'USD',
        success_url: `${origin}/account/esim/buy/success`,
        cancel_url: `${origin}/account/esim/buy/cancel`
      })
    });

    const trackerData = await trackerResponse.json();
    console.log("Safepay Full Response:", trackerData);

    if (trackerData && trackerData.data && trackerData.data.token) {
      const trackerToken = trackerData.data.token;
      
      const checkoutBase = environment === 'sandbox' 
        ? 'https://sandbox.getsafepay.com/checkout/pay' 
        : 'https://www.getsafepay.com/checkout/pay';
        
      const paymentUrl = `${checkoutBase}?env=${environment}&tracker=${trackerToken}`;

      return NextResponse.json({
        success: true,
        url: paymentUrl,
        paymentUrl: paymentUrl,
        orderId: trackerToken
      });
    } else {
      console.error("Safepay Tracker Error Response:", trackerData);
      return NextResponse.json({ 
        success: false, 
        error: trackerData.error?.message || "Safepay tracker creation failed",
        details: trackerData 
      }, { status: 400 });
    }
  } catch (error) {
    console.error("Safepay Init Error:", error);
    return NextResponse.json({ success: false, error: "Server error during payment init" }, { status: 500 });
  }
}