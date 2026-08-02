import { NextRequest, NextResponse } from "next/server";
import {
  deliverOrderEmailAfterCheckout,
  getStoredEmailDelivery,
} from "@/app/lib/email/deliverAfterCheckout";
import { createOrderAccessToken } from "@/app/lib/vesim/orderAccess";
import {
  beginIdempotentCheckout,
  completeIdempotentCheckout,
  extractOrderId,
  extractReturnedOfferId,
  failIdempotentCheckout,
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
  let idempotencyKey = "";

  try {
    let requestBody: {
      offerId?: unknown;
      customerEmail?: unknown;
      country?: unknown;
      currency?: unknown;
      idempotencyKey?: unknown;
      // Intentionally ignored if present — never trusted:
      price?: unknown;
      name?: unknown;
      data?: unknown;
      validity?: unknown;
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
    idempotencyKey =
      typeof requestBody.idempotencyKey === "string"
        ? requestBody.idempotencyKey.trim()
        : "";

    if (!offerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Offer ID is required",
        },
        { status: 400 }
      );
    }

    if (!customerEmail || !isValidEmail(customerEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: "Please provide a valid customer email",
        },
        { status: 400 }
      );
    }

    const idempotency = beginIdempotentCheckout(idempotencyKey);
    if (!idempotency.ok) {
      if (idempotency.orderId) {
        const stored = getStoredEmailDelivery(idempotency.orderId);
        const accessToken = createOrderAccessToken(idempotency.orderId);
        if (!accessToken) {
          return NextResponse.json(
            {
              success: false,
              error: "Unable to authorize order access. Please contact support.",
            },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          orderId: idempotency.orderId,
          accessToken,
          replayed: true,
          emailDelivery: stored.emailDelivery || "already_sent",
          customerEmail: stored.customerEmail || customerEmail,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: idempotency.error,
        },
        { status: idempotency.status }
      );
    }

    // Authoritative verification — ignore any client-supplied price/name/data.
    const verifiedOffer = await verifyOfferAuthoritative({
      offerId,
      countryHint,
    });

    if (!verifiedOffer) {
      failIdempotentCheckout(idempotencyKey);
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

    const checkoutResponse = await fetch(`${baseUrl}/api/checkout/credit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `${token.tokenType} ${token.accessToken}`,
      },
      body: JSON.stringify({
        offerId: verifiedOffer.offerId,
        customerEmail,
        platform: "api",
      }),
      cache: "no-store",
    });

    const checkoutData = await readJsonSafe(checkoutResponse);
    const orderId = extractOrderId(checkoutData);

    if (!checkoutResponse.ok || !orderId) {
      failIdempotentCheckout(idempotencyKey);
      console.error(
        "VeSIM checkout failed:",
        checkoutResponse.status,
        typeof checkoutData.error === "string"
          ? checkoutData.error
          : typeof checkoutData.message === "string"
            ? checkoutData.message
            : "unknown"
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to complete the purchase. Please try again.",
        },
        {
          status: checkoutResponse.status >= 400 ? checkoutResponse.status : 502,
        }
      );
    }

    const returnedOfferId = extractReturnedOfferId(checkoutData);
    if (
      returnedOfferId &&
      returnedOfferId.trim().toUpperCase() !==
        verifiedOffer.offerId.trim().toUpperCase()
    ) {
      failIdempotentCheckout(idempotencyKey);
      console.error("Checkout offer mismatch", {
        expected: verifiedOffer.offerId,
        returned: returnedOfferId,
        orderId,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Order verification failed. Please contact support.",
        },
        { status: 502 }
      );
    }

    completeIdempotentCheckout(idempotencyKey, orderId);

    const accessToken = createOrderAccessToken(orderId);
    if (!accessToken) {
      // Order already exists at VeSIM — do not fail the purchase, but install
      // APIs require a token so surface a clear server configuration error.
      console.error("Order access token mint failed after checkout");
      return NextResponse.json({
        success: true,
        orderId,
        offerId: verifiedOffer.offerId,
        emailDelivery: "failed",
        customerEmail,
        error: "Order created, but secure access could not be authorized.",
      });
    }

    // Email is best-effort and never fails the verified VeSIM order.
    const emailResult = await deliverOrderEmailAfterCheckout({
      orderId,
      customerEmail,
      verifiedOffer,
      checkoutPayload: checkoutData,
      accessToken,
    });

    return NextResponse.json({
      success: true,
      orderId,
      accessToken,
      offerId: verifiedOffer.offerId,
      emailDelivery: emailResult.emailDelivery,
      customerEmail: emailResult.customerEmail,
    });
  } catch (error: unknown) {
    failIdempotentCheckout(idempotencyKey);
    console.error(
      "VeSIM checkout route error:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(
          error,
          "Unable to complete the purchase. Please try again."
        ),
      },
      { status: 500 }
    );
  }
}
