"use server";

import { redirect } from "next/navigation";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { requireRole } from "@/app/lib/auth/session";
import type { AdminWalletPurchaseActionState } from "@/app/lib/esim/adminWalletPurchaseFormState";
import {
  parseAssistedWalletConfirmPhrase,
  parseAssistedWalletIdempotencyKey,
  parseAssistedWalletPurchaseReason,
} from "@/app/lib/esim/adminWalletPurchaseValidation";
import { listAdminWalletBuyOffers } from "@/app/lib/esim/adminWalletPurchaseRead";
import {
  WalletEsimPurchaseError,
  confirmWalletEsimPurchase,
  prepareWalletEsimPurchase,
} from "@/app/lib/esim/walletPurchase";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

function reviewPath(customerUserId: string, purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/admin/customers/${encodeURIComponent(customerUserId)}/esim/wallet-buy/review?${params.toString()}`;
}

function successPath(customerUserId: string, purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/admin/customers/${encodeURIComponent(customerUserId)}/esim/wallet-buy/success?${params.toString()}`;
}

function failedPath(customerUserId: string, purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/admin/customers/${encodeURIComponent(customerUserId)}/esim/wallet-buy/failed?${params.toString()}`;
}

function reconciliationPath(customerUserId: string, purchaseId: string): string {
  const params = new URLSearchParams({ purchase: purchaseId });
  return `/admin/customers/${encodeURIComponent(customerUserId)}/esim/wallet-buy/review-needed?${params.toString()}`;
}

function enforceAssistedRateLimits(
  adminUserId: string,
  customerUserId: string
): AdminWalletPurchaseActionState | null {
  const adminLimit = consumeRateLimit({
    key: `admin-wallet-buy:admin:${adminUserId}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminLimit.ok) {
    return {
      ok: false,
      error: "Too many assisted purchase attempts. Please wait and try again.",
    };
  }
  const customerLimit = consumeRateLimit({
    key: `admin-wallet-buy:customer:${customerUserId}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!customerLimit.ok) {
    return {
      ok: false,
      error:
        "Too many assisted purchase attempts for this customer. Please wait and try again.",
    };
  }
  return null;
}

export async function loadAdminWalletBuyOffersAction(
  destinationCode: string
): Promise<Awaited<ReturnType<typeof listAdminWalletBuyOffers>>> {
  await requireRole("ADMIN");
  return listAdminWalletBuyOffers(destinationCode);
}

export async function prepareAdminWalletPurchaseAction(
  _prev: AdminWalletPurchaseActionState,
  formData: FormData
): Promise<AdminWalletPurchaseActionState> {
  const admin = await requireRole("ADMIN");

  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const offerId = normalizeOfferId(formData.get("offerId"));
  const countryHint = sanitizeCountryHint(formData.get("destinationCode"));
  const reasonParsed = parseAssistedWalletPurchaseReason(formData.get("reason"));
  const idempotencyParsed = parseAssistedWalletIdempotencyKey(
    formData.get("idempotencyKey")
  );

  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("planName");
  void formData.get("dataAllowance");
  void formData.get("validity");
  void formData.get("walletBalance");

  if (!customerUserId || customerUserId.length > 64) {
    return { ok: false, error: "Customer is unavailable." };
  }

  const rateBlocked = enforceAssistedRateLimits(admin.id, customerUserId);
  if (rateBlocked) return rateBlocked;

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
  if (!reasonParsed.ok) {
    return {
      ok: false,
      fieldErrors: { reason: reasonParsed.error },
      error: reasonParsed.error,
    };
  }
  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  let result;
  try {
    result = await prepareWalletEsimPurchase({
      customerUserId,
      offerId,
      countryHint,
      idempotencyKey: idempotencyParsed.value,
      assistedBy: {
        adminUserId: admin.id,
        reason: reasonParsed.value,
      },
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
      error: "Assisted wallet purchase is temporarily unavailable.",
    };
  }

  redirect(reviewPath(customerUserId, result.purchaseId));
}

export async function confirmAdminWalletPurchaseAction(
  _prev: AdminWalletPurchaseActionState,
  formData: FormData
): Promise<AdminWalletPurchaseActionState> {
  const admin = await requireRole("ADMIN");

  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const idempotencyParsed = parseAssistedWalletIdempotencyKey(
    formData.get("idempotencyKey")
  );
  const confirmed = formData.get("confirm") === "on";
  const phraseParsed = parseAssistedWalletConfirmPhrase(
    formData.get("confirmPhrase")
  );

  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("walletBalance");

  if (!customerUserId || customerUserId.length > 64) {
    return { ok: false, error: "Customer is unavailable." };
  }
  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: "This purchase is unavailable." };
  }

  const rateBlocked = enforceAssistedRateLimits(admin.id, customerUserId);
  if (rateBlocked) return rateBlocked;

  if (!confirmed) {
    return {
      ok: false,
      fieldErrors: {
        confirm: "Confirm that you reviewed this assisted wallet purchase.",
      },
      error: "Confirmation is required before purchasing with wallet funds.",
    };
  }
  if (!phraseParsed.ok) {
    return {
      ok: false,
      fieldErrors: { confirmPhrase: phraseParsed.error },
      error: phraseParsed.error,
    };
  }
  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  let result;
  try {
    result = await confirmWalletEsimPurchase({
      customerUserId,
      purchaseId,
      idempotencyKey: idempotencyParsed.value,
      assistedByAdminUserId: admin.id,
    });
  } catch (error) {
    if (error instanceof WalletEsimPurchaseError) {
      if (error.code === "PROVIDER_FAILED") {
        redirect(failedPath(customerUserId, purchaseId));
      }
      if (error.code === "RECONCILIATION_REQUIRED") {
        redirect(reconciliationPath(customerUserId, purchaseId));
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Assisted wallet purchase is temporarily unavailable.",
    };
  }

  if (result.status !== "COMPLETED" || !result.orderId) {
    redirect(reconciliationPath(customerUserId, result.purchaseId));
  }

  redirect(successPath(customerUserId, result.purchaseId));
}
