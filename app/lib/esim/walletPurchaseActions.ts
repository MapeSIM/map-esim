"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  WalletEsimPurchaseError,
  confirmWalletEsimPurchase,
  prepareWalletEsimPurchase,
} from "@/app/lib/esim/walletPurchase";
import type { WalletPurchaseActionState } from "@/app/lib/esim/walletPurchaseFormState";
import { parseWalletPurchaseIdempotencyKey } from "@/app/lib/esim/walletPurchaseValidation";
import {
  listAdminAssignmentOffers,
  type AdminOfferOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";
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

  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("walletBalance");

  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: "This purchase is unavailable." };
  }
  if (!confirmed) {
    return {
      ok: false,
      fieldErrors: {
        confirm: "Confirm that you reviewed this wallet purchase.",
      },
      error: "Confirmation is required before buying with wallet funds.",
    };
  }
  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
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
