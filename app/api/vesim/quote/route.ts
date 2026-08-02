import { NextRequest, NextResponse } from "next/server";
import {
  getBrokerToken,
  getVesimBaseUrl,
  isValidEmail,
  normalizeOfferId,
  publicErrorMessage,
  readJsonSafe,
  sanitizeCountryHint,
  verifyOfferAuthoritative,
} from "@/app/lib/vesim/server";

export async function POST(req: NextRequest) {
  try {
    let requestBody: {
      offerId?: unknown;
      customerEmail?: unknown;
      country?: unknown;
      price?: unknown;
      name?: unknown;
    };

    try {
      requestBody = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
        },
        { status: 400 }
      );
    }

    const offerId = normalizeOfferId(requestBody.offerId);
    const customerEmail =
      typeof requestBody.customerEmail === "string"
        ? requestBody.customerEmail.trim()
        : "";
    const countryHint = sanitizeCountryHint(requestBody.country);

    if (!offerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Offer ID is required",
        },
        { status: 400 }
      );
    }

    if (customerEmail && !isValidEmail(customerEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a valid customer email",
        },
        { status: 400 }
      );
    }

    const verifiedOffer = await verifyOfferAuthoritative({
      offerId,
      countryHint,
    });

    if (!verifiedOffer) {
      return NextResponse.json(
        {
          success: false,
          error: "Plan unavailable",
        },
        { status: 404 }
      );
    }

    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();

    const quoteResponse = await fetch(
      `${baseUrl}/api/checkout/credit/quote`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        body: JSON.stringify({
          offerId: verifiedOffer.offerId,
          ...(customerEmail ? { customerEmail } : {}),
        }),
        cache: "no-store",
      }
    );

    const quoteData = await readJsonSafe(quoteResponse);

    if (!quoteResponse.ok) {
      console.error(
        "VeSIM quote failed:",
        quoteResponse.status,
        typeof quoteData.error === "string" ? quoteData.error : "unknown"
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to retrieve a quote for this plan",
          offer: verifiedOffer,
        },
        { status: quoteResponse.status >= 400 ? quoteResponse.status : 502 }
      );
    }

    // Prefer verified offer fields for customer-facing amounts.
    return NextResponse.json({
      success: true,
      offer: verifiedOffer,
      quote: {
        offerId: verifiedOffer.offerId,
        priceUSD: verifiedOffer.priceUSD,
        currency: verifiedOffer.currency,
      },
    });
  } catch (error: unknown) {
    console.error(
      "VeSIM quote route error:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to retrieve a quote"),
      },
      { status: 500 }
    );
  }
}
