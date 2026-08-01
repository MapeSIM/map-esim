import { NextResponse } from "next/server";

export async function GET() {
  try {
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

    const res = await fetch(
      `${process.env.VESIM_BASE_URL}/api/esim/destinations`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const data = await res.json();

    return NextResponse.json(data);

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Destination API failed",
      },
      { status: 500 }
    );
  }
}
