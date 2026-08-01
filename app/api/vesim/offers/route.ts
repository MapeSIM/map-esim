import { NextResponse } from "next/server";
import { normalizeOffers } from "@/app/lib/vesim/offers";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const country = (searchParams.get("country") || "US").toUpperCase();

    const tokenRes = await fetch(
      `${process.env.VESIM_BASE_URL}/api/auth/broker/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: process.env.VESIM_EMAIL,
          password: process.env.VESIM_PASSWORD,
        }),
      }
    );

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return NextResponse.json(
        {
          success: false,
          error: "Token failed",
        },
        {
          status: 401,
        }
      );
    }

    const offersRes = await fetch(
      `${process.env.VESIM_BASE_URL}/api/esim/offers?country=${country}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const offersData = await offersRes.json();

    if (!offersRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            offersData?.error ||
            offersData?.message ||
            "Failed to load offers from VeSIM",
          offers: [],
        },
        {
          status: offersRes.status || 502,
        }
      );
    }

    const offers = normalizeOffers(offersData);

    return NextResponse.json({
      success: true,
      country,
      count: offers.length,
      offers,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unexpected offers error";

    return NextResponse.json(
      {
        success: false,
        error: message,
        offers: [],
      },
      {
        status: 500,
      }
    );
  }
}
