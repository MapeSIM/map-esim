import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { offerId, customerEmail } = body;

    const environment = process.env.SAFEPAY_ENVIRONMENT || 'sandbox';
    const apiKey = process.env.SAFEPAY_API_KEY;
    const secretKey = process.env.SAFEPAY_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return NextResponse.json({ success: false, error: "Safepay keys are missing from server" }, { status: 500 });
    }

    const apiUrl = environment === 'sandbox' 
      ? 'https://sandbox.api.getsafepay.com' 
      : 'https://api.getsafepay.com';

    // 1. Safepay Tracker Initialize Karein
    const trackerResponse = await fetch(`${apiUrl}/order/v1/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SFPY-MERCHANT-SECRET': secretKey
      },
      body: JSON.stringify({
        client: apiKey,
        environment: environment,
        amount: 10.00, // Testing amount ($10)
        currency: 'USD'
      })
    });

    const trackerData = await trackerResponse.json();

    if (trackerData && trackerData.data && trackerData.data.token) {
      const trackerToken = trackerData.data.token;
      
      // 2. Checkout URL Generate Karein
      const checkoutBase = environment === 'sandbox' 
        ? 'https://sandbox.api.getsafepay.com/checkout/pay' 
        : 'https://getsafepay.com/checkout/pay';
        
      const paymentUrl = `${checkoutBase}?env=${environment}&tracker=${trackerToken}`;

      return NextResponse.json({
        success: true,
        paymentUrl: paymentUrl,
        orderId: trackerToken
      });
    } else {
      return NextResponse.json({ success: false, error: "Safepay tracker creation failed" }, { status: 400 });
    }
  } catch (error) {
    console.error("Safepay Init Error:", error);
    return NextResponse.json({ success: false, error: "Server error during payment init" }, { status: 500 });
  }
}