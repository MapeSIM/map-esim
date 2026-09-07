"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  EsimPurchaseGatewayCheckoutError,
  startEsimPurchaseHostedCheckout,
} from "@/app/lib/esim/esimPurchaseGatewayCheckout";
import { maybeReleasePendingGatewayReservationForPurchase } from "@/app/lib/esim/esimPurchasePaymentApply";
import {
  WalletEsimPurchaseError,
  confirmWalletEsimPurchase,
  prepareWalletEsimPurchase,
  setWalletPurchaseFundingChoice,
} from "@/app/lib/esim/walletPurchase";
import { esimPurchasePaymentCancelPath } from "@/app/lib/payments/safepayCheckoutPaths";
import {
  CARD_PAYMENT_UNAVAILABLE_MESSAGE,
  type WalletPurchaseActionState,
} from "@/app/lib/esim/walletPurchaseFormState";
import {
  EsimDeliveryEmailError,
  ALTERNATE_DELIVERY_EMAIL_MESSAGES,
} from "@/app/lib/esim/esimDeliveryEmail";
import {
  clearWalletPurchaseAlternateDeliveryEmail,
  saveWalletPurchaseAlternateDeliveryEmail,
} from "@/app/lib/esim/esimDeliveryEmailMutations";
import type { DeliveryEmailActionState } from "@/app/lib/esim/esimDeliveryEmailFormState";
import {
  parseUseRewardsChoice,
  parseWalletPurchaseIdempotencyKey,
  resolveCustomerCheckoutUseWallet,
} from "@/app/lib/esim/walletPurchaseValidation";
import {
  listAdminAssignmentOffers,
  type AdminOfferOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import { parsePaymentGatewayProvider } from "@/app/lib/payments/gatewaySelect";
import { parseSimpaisaWalletCheckoutFields } from "@/app/lib/payments/simpaisaPkrQuote";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export async function loadCustomerWalletPurchaseOffersAction(
  destinationCode: string
): Promise<AdminOfferOption[]> {
  await requireRole("CUSTOMER");
  return listAdminAssignmentOffers(destinationCode);
}

function reviewPath(purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/account/esim/buy/review?${params.toString()}`;
}

function successPath(purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/account/esim/buy/success?${params.toString()}`;
}

function failedPath(purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/account/esim/buy/failed?${params.toString()}`;
}

function reconciliationPath(purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/account/esim/buy/review-needed?${params.toString()}`;
}

export async function prepareWalletEsimPurchaseAction(
  _prev: WalletPurchaseActionState,
  formData: FormData
): Promise<WalletPurchaseActionState> {
  const customer = await requireRole("CUSTOMER");

  const offerId = normalizeOfferId(formData.get("offerId"));
  const countryHint = sanitizeCountryHint(formData.get("destinationCode"));
  const idempotencyParsed = parseWalletPurchaseIdempotencyKey(
    formData.get("idempotencyKey")
  );

  // Never trust browser money/package fields.
  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("planName");
  void formData.get("dataAllowance");
  void formData.get("validity");

  if (!offerId) {
    return {
      ok: false,
      fieldErrors: { offerId: "Select an available package." },
      error: "Select an available package.",
    };
  }
  if (!countryHint) {
    return {
      ok: false,
      fieldErrors: { destination: "Select a destination." },
      error: "Select a destination.",
    };
  }
  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  let result;
  try {
    result = await prepareWalletEsimPurchase({
      customerUserId: customer.id,
      offerId,
      countryHint,
      idempotencyKey: idempotencyParsed.value,
    });
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) {
      if (error.code === "OFFER_UNAVAILABLE") {
        return {
          ok: false,
          fieldErrors: { offerId: error.message },
          error: error.message,
        };
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Wallet purchase is temporarily unavailable. Please try again shortly.",
    };
  }

  redirect(reviewPath(result.purchaseId));
}

/**
 * Persist READY purchase funding choice. Accepts useWallet only — never client money.
 * Does not reserve wallet funds or create gateway sessions.
 */
export async function setWalletPurchaseFundingChoiceAction(
  _prev: WalletPurchaseActionState,
  formData: FormData
): Promise<WalletPurchaseActionState> {
  const customer = await requireRole("CUSTOMER");
  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const resolved = resolveCustomerCheckoutUseWallet(formData);
  if (resolved.error) {
    return {
      ok: false,
      fieldErrors: { paymentMode: resolved.error },
      error: resolved.error,
    };
  }
  const useWallet = resolved.useWallet;
  const useRewards = parseUseRewardsChoice(formData.get("useRewards"));

  void formData.get("walletAppliedCents");
  void formData.get("gatewayAmountCents");
  void formData.get("price");
  void formData.get("priceCents");
  void formData.get("walletBalance");
  void formData.get("rewardPoints");
  void formData.get("rewardPointsRedeemed");
  void formData.get("pointsBalance");
  void formData.get("useWallet");

  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: "This purchase is unavailable." };
  }

  try {
    await setWalletPurchaseFundingChoice({
      customerUserId: customer.id,
      purchaseId,
      useWallet,
      useRewards,
    });
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Wallet purchase is temporarily unavailable. Please try again shortly.",
    };
  }

  return { ok: true };
}

export async function confirmWalletEsimPurchaseAction(
  _prev: WalletPurchaseActionState,
  formData: FormData
): Promise<WalletPurchaseActionState> {
  const customer = await requireRole("CUSTOMER");

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const idempotencyParsed = parseWalletPurchaseIdempotencyKey(
    formData.get("idempotencyKey")
  );
  const confirmed = formData.get("confirm") === "on";
  const resolved = resolveCustomerCheckoutUseWallet(formData);
  if (resolved.error) {
    return {
      ok: false,
      fieldErrors: { paymentMode: resolved.error },
      error: resolved.error,
    };
  }
  const useWallet = resolved.useWallet;
  const useRewards = parseUseRewardsChoice(formData.get("useRewards"));
  const walletOperatorIdRaw = formData.get("walletOperatorId");
  const customerMsisdnRaw = formData.get("customerMsisdn");

  // Never trust browser money fields or delivery-email fields.
  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("walletBalance");
  void formData.get("walletAppliedCents");
  void formData.get("gatewayAmountCents");
  void formData.get("redirect_url");
  void formData.get("cancel_url");
  void formData.get("chargeAmount");
  void formData.get("currency");
  void formData.get("promoCode");
  void formData.get("discountCents");
  void formData.get("finalPriceCents");
  void formData.get("percent");
  void formData.get("rewardPoints");
  void formData.get("rewardPointsRedeemed");
  void formData.get("pointsBalance");
  void formData.get("deliveryEmail");
  void formData.get("deliveryEmailConfirm");
  void formData.get("deliveryEmailAttestation");
  void formData.get("useAlternateDeliveryEmail");
  void formData.get("useWallet");

  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: "This purchase is unavailable." };
  }
  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  // Persist funding choice when purchase is still READY (no-op path for awaiting retry).
  let funding;
  try {
    funding = await setWalletPurchaseFundingChoice({
      customerUserId: customer.id,
      purchaseId,
      useWallet,
      useRewards,
    });
  } catch (error) {
    if (
      error instanceof WalletEsimPurchaseError &&
      error.code === "INVALID_STATE"
    ) {
      // Purchase may already be AWAITING_GATEWAY_PAYMENT — continue into gateway start,
      // which recomputes funding server-side from useWallet + authoritative price/balance.
      funding = null;
    } else if (error instanceof WalletEsimPurchaseError) {
      return { ok: false, error: error.message };
    } else {
      return {
        ok: false,
        error:
          "Wallet purchase is temporarily unavailable. Please try again shortly.",
      };
    }
  }

  const startHostedCheckout = async (): Promise<
    | { ok: true; checkout: Awaited<ReturnType<typeof startEsimPurchaseHostedCheckout>> }
    | {
        ok: false;
        error: string;
        code?: EsimPurchaseGatewayCheckoutError["code"];
        fieldErrors?: {
          walletOperatorId?: string;
          customerMsisdn?: string;
        };
      }
  > => {
    let walletOperatorId: string | undefined;
    let customerMsisdn: string | undefined;

    const selected = parsePaymentGatewayProvider(
      process.env.PAYMENT_GATEWAY_PROVIDER
    );
    if (selected === "SIMPAISA") {
      const walletFields = parseSimpaisaWalletCheckoutFields({
        walletOperatorId: walletOperatorIdRaw,
        customerMsisdn: customerMsisdnRaw,
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
    }

    try {
      const checkout = await startEsimPurchaseHostedCheckout({
        customerUserId: customer.id,
        purchaseId,
        useWallet,
        useRewards,
        walletOperatorId,
        customerMsisdn,
      });
      return { ok: true, checkout };
    } catch (error) {
      if (error instanceof EsimPurchaseGatewayCheckoutError) {
        if (error.message === "Select Easypaisa or JazzCash.") {
          return {
            ok: false,
            code: error.code,
            fieldErrors: { walletOperatorId: error.message },
            error: error.message,
          };
        }
        if (error.message.includes("mobile number")) {
          return {
            ok: false,
            code: error.code,
            fieldErrors: { customerMsisdn: error.message },
            error: error.message,
          };
        }
        return { ok: false, code: error.code, error: error.message };
      }
      return {
        ok: false,
        error: CARD_PAYMENT_UNAVAILABLE_MESSAGE,
      };
    }
  };

  if (funding) {
    if (funding.gatewayAmountCents > 0) {
      if (!isPaymentGatewayConfigured()) {
        return { ok: false, error: CARD_PAYMENT_UNAVAILABLE_MESSAGE };
      }

      const started = await startHostedCheckout();
      if (!started.ok) {
        return {
          ok: false,
          error: started.error,
          fieldErrors: started.fieldErrors,
        };
      }
      // Must stay outside try/catch — redirect() throws NEXT_REDIRECT.
      // External hosted checkout — never log checkoutUrl/tokens.
      redirect(started.checkout.checkoutUrl);
    }
  } else {
    // READY funding persist failed (likely AWAITING_GATEWAY_PAYMENT).
    // Attempt gateway resume when gateway payment is still required.
    let resumeInvalidState = false;
    let checkout: Awaited<
      ReturnType<typeof startEsimPurchaseHostedCheckout>
    > | null = null;
    if (!isPaymentGatewayConfigured()) {
      return { ok: false, error: CARD_PAYMENT_UNAVAILABLE_MESSAGE };
    }
    const started = await startHostedCheckout();
    if (!started.ok) {
      if (started.code === "INVALID_STATE" && !started.fieldErrors) {
        // May be full-wallet after funding change while awaiting — fall through.
        resumeInvalidState = true;
      } else {
        return {
          ok: false,
          error: started.error,
          fieldErrors: started.fieldErrors,
        };
      }
    } else {
      checkout = started.checkout;
    }
    if (!resumeInvalidState && checkout) {
      // Must stay outside try/catch — redirect() throws NEXT_REDIRECT.
      redirect(checkout.checkoutUrl);
    }
  }
  // Full wallet coverage only — existing secure confirm path.
  if (!confirmed) {
    return {
      ok: false,
      fieldErrors: {
        confirm: "Confirm that you reviewed this wallet purchase.",
      },
      error: "Confirmation is required before buying with wallet funds.",
    };
  }

  let result;
  try {
    result = await confirmWalletEsimPurchase({
      customerUserId: customer.id,
      purchaseId,
      idempotencyKey: idempotencyParsed.value,
    });
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) {
      if (error.code === "PROVIDER_FAILED") {
        redirect(failedPath(purchaseId));
      }
      if (error.code === "RECONCILIATION_REQUIRED") {
        redirect(reconciliationPath(purchaseId));
      }
      if (error.code === "PROMO_INVALID" || error.code === "REWARDS_INVALID") {
        return { ok: false, error: error.message };
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Wallet purchase is temporarily unavailable. Please try again shortly.",
    };
  }

  if (result.status !== "COMPLETED" || !result.orderId) {
    redirect(reconciliationPath(result.purchaseId));
  }

  redirect(successPath(result.purchaseId));
}

function mapDeliveryEmailError(error: unknown): DeliveryEmailActionState {
  if (error instanceof EsimDeliveryEmailError) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: ALTERNATE_DELIVERY_EMAIL_MESSAGES.unavailable };
}

export async function saveWalletPurchaseAlternateDeliveryEmailAction(
  _prev: DeliveryEmailActionState,
  formData: FormData
): Promise<DeliveryEmailActionState> {
  const customer = await requireRole("CUSTOMER");
  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  void formData.get("price");
  void formData.get("customerEmail");
  void formData.get("accountEmail");

  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: ALTERNATE_DELIVERY_EMAIL_MESSAGES.unavailable };
  }

  try {
    const result = await saveWalletPurchaseAlternateDeliveryEmail({
      customerUserId: customer.id,
      purchaseId,
      deliveryEmail: formData.get("deliveryEmail"),
      confirmDeliveryEmail: formData.get("deliveryEmailConfirm"),
      attested: formData.get("deliveryEmailAttestation") === "on",
    });
    return { ok: true, mode: result.mode };
  } catch (error) {
    return mapDeliveryEmailError(error);
  }
}

export async function clearWalletPurchaseAlternateDeliveryEmailAction(
  _prev: DeliveryEmailActionState,
  formData: FormData
): Promise<DeliveryEmailActionState> {
  const customer = await requireRole("CUSTOMER");
  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  void formData.get("deliveryEmail");
  void formData.get("deliveryEmailConfirm");
  void formData.get("customerEmail");

  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: ALTERNATE_DELIVERY_EMAIL_MESSAGES.unavailable };
  }

  try {
    const result = await clearWalletPurchaseAlternateDeliveryEmail({
      customerUserId: customer.id,
      purchaseId,
    });
    return { ok: true, mode: result.mode };
  } catch (error) {
    return mapDeliveryEmailError(error);
  }
}

/**
 * Customer abandon path for hybrid checkout: release a still-pending wallet
 * reservation without marking the purchase funded and without refund APIs.
 * Redirects to the existing cancel page after the CAS release attempt.
 */
export async function cancelPendingEsimGatewayCheckoutAction(
  formData: FormData
): Promise<void> {
  const customer = await requireRole("CUSTOMER");
  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const attemptIdRaw = String(formData.get("attemptId") ?? "").trim();
  if (!purchaseId || purchaseId.length > 64) {
    redirect("/account/esim/buy");
  }

  const result = await maybeReleasePendingGatewayReservationForPurchase({
    customerUserId: customer.id,
    purchaseId,
    attemptId: attemptIdRaw || null,
  }).catch(() => ({ released: false, attemptId: null as string | null }));

  if (result.attemptId) {
    redirect(esimPurchasePaymentCancelPath(result.attemptId));
  }
  redirect(reviewPath(purchaseId));
}
