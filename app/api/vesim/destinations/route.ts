import { NextResponse } from "next/server";
import {
  fetchDestinations,
  publicErrorMessage,
} from "@/app/lib/vesim/server";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import { VESIM_ENV_PUBLIC_ERROR } from "@/app/lib/vesim/environmentPolicy";

export async function GET() {
  try {
    const destinations = await fetchDestinations();
    return NextResponse.json(
      {
        success: true,
        destinations,
      },
      {
        // Catalog changes slowly; short cache cuts repeat VeSIM token/list work.
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
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
