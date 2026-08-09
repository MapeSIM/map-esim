import { NextResponse } from "next/server";
import {
  fetchPublicDestinationCatalog,
  publicErrorMessage,
} from "@/app/lib/vesim/server";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import { VESIM_ENV_PUBLIC_ERROR } from "@/app/lib/vesim/environmentPolicy";

export async function GET() {
  try {
    // Starting from = lowest buyable MAP retail (offer-derived), not entry-tier estimate.
    const destinations = await fetchPublicDestinationCatalog();
    return NextResponse.json(
      {
        success: true,
        destinations,
      },
      {
        // Align with offer-min catalog revalidate; edge can serve stale while refresh runs.
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: unknown) {
    if (error instanceof VesimEnvironmentError) {
      return NextResponse.json(
        {
          success: false,
          error: VESIM_ENV_PUBLIC_ERROR,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to load destinations"),
      },
      { status: 500 }
    );
  }
}
