import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  EsimPurchaseGatewayCheckoutError,
  startEsimPurchaseHostedCheckout,
} from "@/app/lib/esim/esimPurchaseGatewayCheckout";
import {
  setWalletPurchaseFundingChoice,
  WalletEsimPurchaseError,
} from "@/app/lib/esim/walletPurchase";
import { CARD_PAYMENT_UNAVAILABLE_MESSAGE } from "@/app/lib/esim/walletPurchaseFormState";
import {
  parseUseRewardsChoice,
  parseUseWalletChoice,
} from "@/app/lib/esim/walletPurchaseValidation";
import { prisma as db } from "@/app/lib/db";
import {
  CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE,
  isCustomerPaymentCheckoutDisabled,
  isCustomerSafepayCheckoutDisabled,
} from "@/app/lib/payments/customerPaymentCheckoutPolicy";
import { isSafepayCheckoutConfigured } from "@/app/lib/payments/disabledAdapter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Authenticated Safepay card checkout initiation for an owned WalletEsimPurchase.
 * Amount/currency come from server-side funding — never from the request body.
 * Guest offerId init is intentionally rejected (no durable attempt / wrong amount).
 * Never logs checkout URLs, trackers, or secrets.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const customerUserId = session?.user?.id?.trim() ?? "";
    if (!customerUserId || session?.user?.role !== "CUSTOMER") {
      return NextResponse.json(
        { success: false, error: "Please sign in to continue to card payment." },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request." },
        { status: 400 }
      );
    }

    const record =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    if (!record) {
      return NextResponse.json(
        { success: false, error: "Invalid request." },
        { status: 400 }
      );
    }

    // Reject legacy guest/hardcoded path — amounts must come from a purchase.
    if (record.offerId != null && String(record.offerId).trim() !== "") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Card payment requires a signed-in account checkout. Please sign in and buy from your account.",
        },
        { status: 400 }
      );
    }

    const purchaseId = String(record.purchaseId ?? "").trim();
    if (!purchaseId || purchaseId.length > 64) {
      return NextResponse.json(
        { success: false, error: "This purchase is unavailable." },
        { status: 400 }
      );
    }

    if (isCustomerPaymentCheckoutDisabled()) {
      return NextResponse.json(
        {
          success: false,
          error: CUSTOMER_PAYMENT_TEMPORARILY_UNAVAILABLE_MESSAGE,
        },
        { status: 503 }
      );
    }
    if (isCustomerSafepayCheckoutDisabled()) {
      return NextResponse.json(
        { success: false, error: CARD_PAYMENT_UNAVAILABLE_MESSAGE },
        { status: 503 }
      );
    }

    const safepayRow = await db.safepayConfig.findUnique({
      where: { id: "default" },
      select: { enabled: true },
    });
    if (!safepayRow?.enabled) {
      return NextResponse.json(
        { success: false, error: CARD_PAYMENT_UNAVAILABLE_MESSAGE },
        { status: 503 }
      );
    }

    if (!isSafepayCheckoutConfigured()) {
      return NextResponse.json(
        { success: false, error: CARD_PAYMENT_UNAVAILABLE_MESSAGE },
        { status: 503 }
      );
    }

    const useWallet = parseUseWalletChoice(record.useWallet);
    const useRewards = parseUseRewardsChoice(record.useRewards);

    try {
      await setWalletPurchaseFundingChoice({
        customerUserId,
        purchaseId,
        useWallet,
        useRewards,
      });
    } catch (error) {
      if (
        error instanceof WalletEsimPurchaseError &&
        error.code === "INVALID_STATE"
      ) {
        // Already AWAITING_GATEWAY_PAYMENT — continue into hosted checkout.
      } else if (error instanceof WalletEsimPurchaseError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      } else {
        console.error("safepay_init", "FUNDING_CHOICE_FAILED");
        return NextResponse.json(
          {
            success: false,
            error:
              "Wallet purchase is temporarily unavailable. Please try again shortly.",
          },
          { status: 503 }
        );
      }
    }

    const checkout = await startEsimPurchaseHostedCheckout({
      customerUserId,
      purchaseId,
      useWallet,
      useRewards,
      preferredGateway: "SAFEPAY",
    });

    return NextResponse.json({
      success: true,
      url: checkout.checkoutUrl,
      paymentUrl: checkout.checkoutUrl,
      paymentAttemptId: checkout.paymentAttemptId,
    });
  } catch (error) {
    if (error instanceof EsimPurchaseGatewayCheckoutError) {
      const status =
        error.code === "GATEWAY_UNAVAILABLE" || error.code === "UNAVAILABLE"
          ? 503
          : error.code === "CUSTOMER_UNAVAILABLE"
            ? 401
            : 400;
      return NextResponse.json(
        { success: false, error: error.message },
        { status }
      );
    }
    console.error("safepay_init", "INIT_FAILED");
    return NextResponse.json(
      { success: false, error: CARD_PAYMENT_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }
}
