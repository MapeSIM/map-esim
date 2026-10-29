import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { offerId, customerEmail } = body;

    // 1. Base price in USD (misal ke taur par $0.99 ya jo bhi offer ho)
    const baseAmountUSD = 0.99; 

    // 2. 8% Fee Add Karein
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

    // Safepay expects amount in cents (integer)
    const calculatedAmount = Math.round(finalUSD * 100);

    console.log("Initializing Safepay with Amount:", calculatedAmount);

    // 3. Safepay Tracker Initialize Karein
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
        intent: 'CYBERSOURCE'
      })
    });

    const trackerData = await trackerResponse.json();
    console.log("Safepay Response:", trackerData);

    if (trackerData && trackerData.data && trackerData.data.token) {
      const trackerToken = trackerData.data.token;
      
      // 4. Checkout URL Generate Karein
      const checkoutBase = environment === 'sandbox' 
        ? 'https://sandbox.api.getsafepay.com/checkout/pay' 
        : 'https://getsafepay.com/checkout/pay';
        
      const paymentUrl = `${checkoutBase}?env=${environment}&tracker=${trackerToken}`;

      return NextResponse.json({
        success: true,
        url: paymentUrl,
        paymentUrl: paymentUrl,
        orderId: trackerToken
      });
    } else {
      console.error("Safepay Tracker Error Response:", trackerData);
      return NextResponse.json({ success: false, error: trackerData.error?.message || "Safepay tracker creation failed" }, { status: 400 });
    }
  } catch (error) {
    console.error("Safepay Init Error:", error);
    return NextResponse.json({ success: false, error: "Server error during payment init" }, { status: 500 });
  }
}