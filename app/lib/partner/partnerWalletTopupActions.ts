"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  createPartnerWalletTopupDraft,
  isPartnerWalletTopupError,
  startPartnerWalletTopupCheckout,
} from "@/app/lib/partner/partnerWalletTopup";
import {
  browserReturnMustNotCreditPartnerWallet,
  logPartnerTopupFailure,
} from "@/app/lib/partner/partnerWalletTopupConstants";
import type { PartnerWalletTopupActionState } from "@/app/lib/partner/partnerWalletTopupFormState";
import {
  getActivePaymentAdapter,
  isPaymentGatewayConfigured,
} from "@/app/lib/payments/disabledAdapter";
import { parseSimpaisaWalletCheckoutFields } from "@/app/lib/payments/simpaisaPkrQuote";
import {
  parseTopupCheckoutIdempotencyKey,
  parseTopupUsdAmountToCents,
} from "@/app/lib/wallet/amount";

function detailPath(topupId: string): string {
  return `/partner/wallet/top-up/${encodeURIComponent(topupId)}`;
}

/**
 * Create Partner draft + start Simpaisa Verify in one Continue action.
 * Redirects to pending page URL — never credits Partner wallet.
 */
export async function startPartnerWalletAddFundsAction(
  _prev: PartnerWalletTopupActionState,
  formData: FormData
): Promise<PartnerWalletTopupActionState> {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return { ok: false, error: "Partner access is unavailable." };
  }

  void formData.get("paid");
  void formData.get("status");
  void formData.get("gatewayStatus");
  void formData.get("chargeAmount");
  void formData.get("pkrAmount");
  void formData.get("fxRate");
  browserReturnMustNotCreditPartnerWallet();

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

  let draft;
  try {
    draft = await createPartnerWalletTopupDraft({
      partnerId: actor.partnerId,
      actorUserId: user.id,
      baseAmountCents: amountParsed.cents,
      checkoutIdempotencyKey: idempotencyParsed.value,
    });
  } catch (error) {
    if (isPartnerWalletTopupError(error)) {
      if (error.code === "INVALID_AMOUNT") {
        return {
          ok: false,
          fieldErrors: { amount: error.message },
          error: error.message,
        };
      }
      return { ok: false, error: error.message };
    }
    logPartnerTopupFailure({ step: "action_create_draft", error });
    return {
      ok: false,
      error:
        "Partner wallet top-up is temporarily unavailable. Please try again shortly.",
    };
  }

  // Duplicate idempotent draft already past draft: go to status page only.
  if (
    draft.duplicate &&
    draft.status !== "DRAFT" &&
    draft.status !== "AWAITING_PAYMENT"
  ) {
    redirect(detailPath(draft.topupId));
  }

  let checkout;
  try {
    checkout = await startPartnerWalletTopupCheckout({
      partnerId: actor.partnerId,
      actorUserId: user.id,
      topupId: draft.topupId,
      walletOperatorId,
      customerMsisdn,
    });
  } catch (error) {
    if (isPartnerWalletTopupError(error)) {
      // Draft exists — send Partner to status page for retry messaging.
      if (
        error.code === "TOPUP_UNAVAILABLE" ||
        error.code === "GATEWAY_UNAVAILABLE"
      ) {
        redirect(detailPath(draft.topupId));
      }
      return { ok: false, error: error.message };
    }
    logPartnerTopupFailure({ step: "action_start_checkout", error });
    return {
      ok: false,
      error: "Payment gateway is not available yet. Please try again later.",
    };
  }

  // Hosted waiting page — never treat browser return as paid.
  redirect(checkout.checkoutUrl);
}

/**
 * Retry checkout for an existing DRAFT Partner top-up (rare — usually new attempt).
 * Failed/expired always use a NEW draft via startPartnerWalletAddFundsAction.
 */
export async function startPartnerWalletTopupCheckoutAction(
  _prev: PartnerWalletTopupActionState,
  formData: FormData
): Promise<PartnerWalletTopupActionState> {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return { ok: false, error: "Partner access is unavailable." };
  }

  const topupId = String(formData.get("topupId") ?? "").trim();
  void formData.get("paid");
  void formData.get("status");
  void formData.get("gatewayStatus");
  void formData.get("pkrAmount");
  void formData.get("fxRate");
  browserReturnMustNotCreditPartnerWallet();

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
    checkout = await startPartnerWalletTopupCheckout({
      partnerId: actor.partnerId,
      actorUserId: user.id,
      topupId,
      walletOperatorId,
      customerMsisdn,
    });
  } catch (error) {
    if (isPartnerWalletTopupError(error)) {
      return { ok: false, error: error.message };
    }
    logPartnerTopupFailure({ step: "action_retry_checkout", error });
    return {
      ok: false,
      error: "Payment gateway is not available yet. Please try again later.",
    };
  }

  redirect(checkout.checkoutUrl);
}
