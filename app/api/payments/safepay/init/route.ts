import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { offerId, customerEmail } = body;

    // 1. Base package price in USD (misal ke taur par $0.99)
    const baseAmountUSD = 0.99; 

    // 2. Custom Exchange Rate ($1 = 293 PKR)
    const exchangeRate = 293;
    const amountInPKR = baseAmountUSD * exchangeRate; // e.g., 0.99 * 293 = ~290.07 PKR

    // 3. 8% Fee Add Karein
    const feePercentage = 0.08; 
    const finalPKR = amountInPKR * (1 + feePercentage); // ~290.07 + 8% = ~313.27 PKR

    const environment = process.env.SAFEPAY_ENVIRONMENT || 'sandbox';
    const apiKey = process.env.SAFEPAY_API_KEY;
    const secretKey = process.env.SAFEPAY_SECRET_KEY;

    if (!apiKey || !secretKey) {
      return NextResponse.json({ success: false, error: "Safepay keys are missing from server" }, { status: 500 });
    }

    const apiUrl = environment === 'sandbox' 
      ? 'https://sandbox.api.getsafepay.com' 
      : 'https://api.getsafepay.com';

    // Safepay expects amount in lowest currency unit (paisas as integer for PKR)
    // 1 PKR = 100 paisas, isliye amount ko 100 se multiply karein aur round off karein
    const calculatedAmount = Math.round(finalPKR * 100);

    // 4. Safepay Tracker Initialize Karein (Currency = PKR)
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
        currency: 'PKR', // Currency ab PKR ho gayi hai
        intent: 'CYBERSOURCE'
      })
    });

    const trackerData = await trackerResponse.json();

    if (trackerData && trackerData.data && trackerData.data.token) {
      const trackerToken = trackerData.data.token;
      
      // 5. Checkout URL Generate Karein
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
      return NextResponse.json({ success: false, error: "Safepay tracker creation failed" }, { status: 400 });
    }
  } catch (error) {
    console.error("Safepay Init Error:", error);
    return NextResponse.json({ success: false, error: "Server error during payment init" }, { status: 500 });
  }
}