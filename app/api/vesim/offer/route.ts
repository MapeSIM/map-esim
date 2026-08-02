import { NextRequest, NextResponse } from "next/server";
import {
  normalizeOfferId,
  publicErrorMessage,
  sanitizeCountryHint,
  verifyOfferAuthoritative,
} from "@/app/lib/vesim/server";

export async function GET(req: NextRequest) {
  try {
    const offerId = normalizeOfferId(req.nextUrl.searchParams.get("offerId"));
    const countryHint = sanitizeCountryHint(
      req.nextUrl.searchParams.get("country")
    );

    if (!offerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Offer ID is required",
        },
        { status: 400 }
      );
    }

    const offer = await verifyOfferAuthoritative({
      offerId,
      countryHint,
    });

    if (!offer) {
      return NextResponse.json(
        {
          success: false,
          error: "Plan unavailable",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      offer,
    });
  } catch (error: unknown) {
    console.error(
      "VeSIM offer verification failed:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to verify this plan"),
      },
      { status: 500 }
    );
  }
}
