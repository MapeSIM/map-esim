import { NextResponse } from "next/server";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import { VESIM_ENV_PUBLIC_ERROR } from "@/app/lib/vesim/environmentPolicy";
import { toPublicVesimOffers } from "@/app/lib/vesim/offers";
import {
  fetchPublicOffersForCountry,
  publicErrorMessage,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const country =
      sanitizeCountryHint(searchParams.get("country")) ||
      (searchParams.get("country") || "US").trim().toUpperCase();

    if (!country || country.length > 64) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid country",
          offers: [],
        },
        { status: 400 }
      );
    }

    const offers = await fetchPublicOffersForCountry(country);

    return NextResponse.json({
      success: true,
      country,
      count: offers.length,
      offers: toPublicVesimOffers(offers),
    });
  } catch (error: unknown) {
    if (error instanceof VesimEnvironmentError) {
      return NextResponse.json(
        {
          success: false,
          error: VESIM_ENV_PUBLIC_ERROR,
          offers: [],
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to load offers"),
        offers: [],
      },
      { status: 500 }
    );
  }
}
