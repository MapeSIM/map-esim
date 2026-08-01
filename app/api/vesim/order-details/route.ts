import { NextRequest, NextResponse } from "next/server";

type ApiData = {
  success?: boolean;
  access_token?: string;
  token_type?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

function getEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing in .env.local`);
  }

  return value;
}

async function readJson(response: Response): Promise<ApiData> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiData;
  } catch {
    return {
      success: false,
      error: "VeSIM returned an invalid JSON response",
      raw: text.slice(0, 500),
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId")?.trim();

    if (!orderId) {
      return NextResponse.json(
        {
          success: false,
          error: "Order ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const baseUrl = getEnv("VESIM_BASE_URL").replace(/\/+$/, "");
    const email = getEnv("VESIM_EMAIL");
    const password = getEnv("VESIM_PASSWORD");

    // Generate fresh broker token
    const tokenResponse = await fetch(
      `${baseUrl}/api/auth/broker/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
        cache: "no-store",
      }
    );

    const tokenData = await readJson(tokenResponse);

    if (!tokenResponse.ok || !tokenData.access_token) {
      return NextResponse.json(
        {
          success: false,
          error: tokenData.error || "VeSIM token generation failed",
          message: tokenData.message,
        },
        {
          status: tokenResponse.status || 401,
        }
      );
    }

    const tokenType =
      typeof tokenData.token_type === "string"
        ? tokenData.token_type
        : "Bearer";

    // Fetch single order details
    const orderResponse = await fetch(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${tokenType} ${tokenData.access_token}`,
        },
        cache: "no-store",
      }
    );

    const orderData = await readJson(orderResponse);

    console.log("VeSIM order details status:", orderResponse.status);

    return NextResponse.json(orderData, {
      status: orderResponse.status,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected server error";

    console.error("VeSIM order details error:", message);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}