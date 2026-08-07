"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  WalletEsimPurchaseError,
  confirmWalletEsimPurchase,
  prepareWalletEsimPurchase,
  setWalletPurchaseFundingChoice,
} from "@/app/lib/esim/walletPurchase";
import {
  CARD_PAYMENT_UNAVAILABLE_MESSAGE,
  type WalletPurchaseActionState,
} from "@/app/lib/esim/walletPurchaseFormState";
import {
  parseUseWalletChoice,
  parseWalletPurchaseIdempotencyKey,
} from "@/app/lib/esim/walletPurchaseValidation";
import {
  listAdminAssignmentOffers,
  type AdminOfferOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
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
  const useWallet = parseUseWalletChoice(formData.get("useWallet"));

  void formData.get("walletAppliedCents");
  void formData.get("gatewayAmountCents");
  void formData.get("price");
  void formData.get("priceCents");
  void formData.get("walletBalance");

  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: "This purchase is unavailable." };
  }

  try {
    await setWalletPurchaseFundingChoice({
      customerUserId: customer.id,
      purchaseId,
      useWallet,
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
  const useWallet = parseUseWalletChoice(formData.get("useWallet"));

  // Never trust browser money fields.
  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("walletBalance");
  void formData.get("walletAppliedCents");
  void formData.get("gatewayAmountCents");

  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: "This purchase is unavailable." };
  }
  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  let funding;
  try {
    funding = await setWalletPurchaseFundingChoice({
      customerUserId: customer.id,
      purchaseId,
      useWallet,
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

  // Gateway remainder required — fail closed until PG3 (no reserve, no order).
  if (funding.gatewayAmountCents > 0) {
    void isPaymentGatewayConfigured();
    return {
      ok: false,
      error: CARD_PAYMENT_UNAVAILABLE_MESSAGE,
    };
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
