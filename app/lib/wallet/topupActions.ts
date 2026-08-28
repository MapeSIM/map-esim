"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  parseTopupCheckoutIdempotencyKey,
  parseTopupUsdAmountToCents,
} from "@/app/lib/wallet/amount";
import type { WalletTopupActionState } from "@/app/lib/wallet/topupFormState";
import {
  WalletTopupError,
  createWalletTopupDraft,
  startWalletTopupCheckout,
} from "@/app/lib/wallet/topup";
import { browserReturnMustNotCreditWallet } from "@/app/lib/wallet/topupConstants";
import {
  getActivePaymentAdapter,
  isPaymentGatewayConfigured,
} from "@/app/lib/payments/disabledAdapter";
import { parseSimpaisaWalletCheckoutFields } from "@/app/lib/payments/simpaisaPkrQuote";

function detailPath(topupId: string): string {
  return `/account/wallet/top-up/${encodeURIComponent(topupId)}`;
}

export async function createWalletTopupDraftAction(
  _prev: WalletTopupActionState,
  formData: FormData
): Promise<WalletTopupActionState> {
  const customer = await requireRole("CUSTOMER");

  // Never trust browser payment/status/amount overrides beyond the USD credit field.
  void formData.get("paid");
  void formData.get("status");
  void formData.get("gatewayStatus");
  void formData.get("chargeAmount");
  void formData.get("pkrAmount");
  void formData.get("fxRate");
  browserReturnMustNotCreditWallet();

  if (!isPaymentGatewayConfigured()) {
    return {
      ok: false,
      error:
        "Adding funds online is not available yet. Payment provider setup is still in progress.",
    };
  }

  const amountParsed = parseTopupUsdAmountToCents(formData.get("amount"));
  const idempotencyParsed = parseTopupCheckoutIdempotencyKey(
    formData.get("idempotencyKey")
  );

  if (!amountParsed.ok) {
    return {
      ok: false,
      fieldErrors: { amount: amountParsed.error },
      error: amountParsed.error,
    };
  }
  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  let result;
  try {
    result = await createWalletTopupDraft({
      customerUserId: customer.id,
      creditAmountCents: amountParsed.cents,
      checkoutIdempotencyKey: idempotencyParsed.value,
    });
  } catch (error) {
    if (error instanceof WalletTopupError) {
      if (error.code === "INVALID_AMOUNT") {
        return {
          ok: false,
          fieldErrors: { amount: error.message },
          error: error.message,
        };
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Wallet top-up is temporarily unavailable. Please try again shortly.",
    };
  }

  redirect(detailPath(result.topupId));
}

export async function startWalletTopupCheckoutAction(
  _prev: WalletTopupActionState,
  formData: FormData
): Promise<WalletTopupActionState> {
  const customer = await requireRole("CUSTOMER");
  const topupId = String(formData.get("topupId") ?? "").trim();

  void formData.get("paid");
  void formData.get("status");
  void formData.get("gatewayStatus");
  void formData.get("pkrAmount");
  void formData.get("fxRate");
  browserReturnMustNotCreditWallet();

  if (!isPaymentGatewayConfigured()) {
    return {
      ok: false,
      error:
        "Adding funds online is not available yet. Payment provider setup is still in progress.",
    };
  }

  if (!topupId || topupId.length > 64) {
    return { ok: false, error: "This top-up is unavailable." };
  }

  let walletOperatorId: string | undefined;
  let customerMsisdn: string | undefined;
  if (getActivePaymentAdapter().provider === "SIMPAISA") {
    const walletFields = parseSimpaisaWalletCheckoutFields({
      walletOperatorId: formData.get("walletOperatorId"),
      customerMsisdn: formData.get("customerMsisdn"),
    });
    if (!walletFields.ok) {
      return {
        ok: false,
        fieldErrors: walletFields.fieldErrors,
        error: walletFields.error,
      };
    }
    walletOperatorId = walletFields.walletOperatorId;
    customerMsisdn = walletFields.customerMsisdn;
  } else {
    void formData.get("walletOperatorId");
    void formData.get("customerMsisdn");
  }

  let checkout;
  try {
    checkout = await startWalletTopupCheckout({
      customerUserId: customer.id,
      topupId,
      walletOperatorId,
      customerMsisdn,
    });
  } catch (error) {
    if (error instanceof WalletTopupError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Payment gateway is not available yet. Please try again later.",
    };
  }

  // Hosted Checkout redirect — never treat browser return as paid.
  redirect(checkout.checkoutUrl);
}
