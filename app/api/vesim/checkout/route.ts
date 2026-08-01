import { NextRequest, NextResponse } from "next/server";

type TokenResponse = {
  success?: boolean;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  message?: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing in .env.local`);
  }

  return value;
}

async function readJsonResponse(
  response: Response
): Promise<ApiResponse> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return {
      success: false,
      error: "VeSIM returned an invalid JSON response",
      raw: text.slice(0, 500),
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const baseUrl = getRequiredEnv("VESIM_BASE_URL").replace(/\/+$/, "");
    const vesimEmail = getRequiredEnv("VESIM_EMAIL");
    const vesimPassword = getRequiredEnv("VESIM_PASSWORD");

    let requestBody: {
      offerId?: unknown;
      customerEmail?: unknown;
    };

    try {
      requestBody = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON request body",
        },
        {
          status: 400,
        }
      );
    }

    const offerId =
      typeof requestBody.offerId === "string"
        ? requestBody.offerId.trim()
        : "";

    const customerEmail =
      typeof requestBody.customerEmail === "string"
        ? requestBody.customerEmail.trim()
        : "";

    if (!offerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Offer ID is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!customerEmail) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer email is required",
        },
        {
          status: 400,
        }
      );
    }

    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      customerEmail
    );

    if (!emailIsValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a valid customer email",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================
    // GENERATE FRESH VESIM BROKER TOKEN
    // =====================================

    const tokenResponse = await fetch(
      `${baseUrl}/api/auth/broker/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: vesimEmail,
          password: vesimPassword,
        }),
        cache: "no-store",
      }
    );

    const tokenData =
      (await readJsonResponse(tokenResponse)) as TokenResponse;

    console.log("VeSIM token status:", tokenResponse.status);

    if (!tokenResponse.ok || !tokenData.access_token) {
      return NextResponse.json(
        {
          success: false,
          error: tokenData.error || "VeSIM token generation failed",
          message: tokenData.message,
        },
        {
          status:
            tokenResponse.status >= 400
              ? tokenResponse.status
              : 401,
        }
      );
    }

    const tokenType = tokenData.token_type?.trim() || "Bearer";

    // =====================================
    // PURCHASE ESIM USING CREDIT BALANCE
    // =====================================

    const checkoutResponse = await fetch(
      `${baseUrl}/api/checkout/credit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `${tokenType} ${tokenData.access_token}`,
        },
        body: JSON.stringify({
          offerId,
          customerEmail,
          platform: "api",
        }),
        cache: "no-store",
      }
    );

    const checkoutData =
      await readJsonResponse(checkoutResponse);

    console.log("VeSIM checkout status:", checkoutResponse.status);

    if (!checkoutResponse.ok) {
      console.error(
        "VeSIM checkout error:",
        checkoutData.error || checkoutData.message
      );
    }

    return NextResponse.json(checkoutData, {
      status: checkoutResponse.status,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "An unexpected server error occurred";

    console.error("VeSIM checkout route error:", message);

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