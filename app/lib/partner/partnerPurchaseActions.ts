"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  normalizeAddDataFromOrderId,
  resolvePartnerAddDataIdempotencyKey,
} from "@/app/lib/esim/addDataCheckout";
import { parseWalletPurchaseIdempotencyKey } from "@/app/lib/esim/walletPurchaseValidation";
import { prisma } from "@/app/lib/db";
import {
  listPartnerCatalogOffers,
  type PartnerCatalogOffer,
} from "@/app/lib/partner/partnerCatalogRead";
import { isPartnerEsimSplitPaymentEnabled } from "@/app/lib/partner/partnerEsimSplitPaymentPolicy";
import { resolvePartnerOwnedRechargeOrderId } from "@/app/lib/partner/partnerAddDataCheckout";
import { getPartnerOwnedOrderDetail } from "@/app/lib/partner/partnerOrders";
import { buyPartnerEsimPurchase } from "@/app/lib/partner/partnerPurchaseBuy";
import {
  mapPartnerPurchaseErrorCode,
  type PartnerPurchaseActionState,
} from "@/app/lib/partner/partnerPurchaseFormState";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  setPartnerPurchaseFundingChoice,
  PartnerEsimPurchaseError,
} from "@/app/lib/partner/partnerEsimPurchase";
import { resolvePartnerCheckoutUseWallet } from "@/app/lib/partner/partnerPurchaseValidation";
import {
  extractCountryHintFromOfferId,
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

/**
 * Load Partner-priced catalog offers (final Partner price labels only).
 * Never trusts browser money / discount fields.
 */
export async function loadPartnerCatalogOffersAction(
  destinationCode: string
): Promise<PartnerCatalogOffer[]> {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) return [];

  const [profile, wallet] = await Promise.all([
    prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: { discountBps: true },
    }),
    prisma.partnerWalletAccount.findUnique({
      where: { partnerId: actor.partnerId },
      select: { balanceCents: true },
    }),
  ]);

  return listPartnerCatalogOffers(destinationCode, {
    discountBps: profile?.discountBps ?? 0,
    walletBalanceCents: wallet?.balanceCents ?? 0,
    splitPaymentEnabled: isPartnerEsimSplitPaymentEnabled(),
  });
}

/**
 * Persist READY purchase funding choice. Accepts paymentMode / useWallet only —
 * never client money. Does not reserve wallet or start gateway.
 */
export async function setPartnerPurchaseFundingChoiceAction(
  _prev: PartnerPurchaseActionState,
  formData: FormData
): Promise<PartnerPurchaseActionState> {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return mapPartnerPurchaseErrorCode("PARTNER_UNAVAILABLE");
  }

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const resolved = resolvePartnerCheckoutUseWallet(formData);
  if (resolved.error) {
    return {
      ok: false,
      kind: "invalid",
      message: resolved.error,
      fieldErrors: { paymentMode: resolved.error },
    };
  }

  void formData.get("walletAppliedCents");
  void formData.get("gatewayAmountCents");
  void formData.get("partnerChargeCents");
  void formData.get("price");
  void formData.get("retailPriceCents");

  if (!purchaseId || purchaseId.length > 64) {
    return {
      ok: false,
      kind: "invalid",
      message: "This purchase is unavailable.",
    };
  }

  try {
    await setPartnerPurchaseFundingChoice({
      partnerUserId: actor.userId,
      purchaseId,
      useWallet: resolved.useWallet,
    });
  } catch (error) {
    if (error instanceof PartnerEsimPurchaseError) {
      return mapPartnerPurchaseErrorCode(error.code, purchaseId);
    }
    return mapPartnerPurchaseErrorCode("UNAVAILABLE", purchaseId);
  }

  return { ok: true, kind: "idle" };
}

/**
 * Partner buy: prepare → reserve → provider (or split checkout when enabled).
 * Accepts offerId + destination hint + idempotency key + optional paymentMode.
 * Never trusts client price / discount / charge fields.
 */
export async function buyPartnerEsimAction(
  _prev: PartnerPurchaseActionState,
  formData: FormData
): Promise<PartnerPurchaseActionState> {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return mapPartnerPurchaseErrorCode("PARTNER_UNAVAILABLE");
  }

  const offerId = normalizeOfferId(formData.get("offerId"));
  const countryHint = sanitizeCountryHint(formData.get("destinationCode"));
  const idempotencyParsed = parseWalletPurchaseIdempotencyKey(
    formData.get("idempotencyKey")
  );
  const resolved = resolvePartnerCheckoutUseWallet(formData);
  if (resolved.error) {
    return {
      ok: false,
      kind: "invalid",
      message: resolved.error,
      fieldErrors: { paymentMode: resolved.error },
    };
  }

  // Never trust browser money / commercial fields.
  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("retailPrice");
  void formData.get("retailPriceCents");
  void formData.get("discountBps");
  void formData.get("partnerChargeCents");
  void formData.get("providerCostCents");
  void formData.get("planName");
  void formData.get("promoCode");
  void formData.get("discountCents");
  void formData.get("finalPriceCents");
  void formData.get("walletAppliedCents");
  void formData.get("gatewayAmountCents");
  void formData.get("useWallet");

  const walletOperatorId = String(formData.get("walletOperatorId") ?? "").trim();
  const customerMsisdn = String(formData.get("customerMsisdn") ?? "").trim();

  if (!offerId) {
    return {
      ok: false,
      kind: "invalid",
      message: "Select an available package.",
      fieldErrors: { offerId: "Select an available package." },
    };
  }
  if (!countryHint) {
    return {
      ok: false,
      kind: "invalid",
      message: "Select a destination.",
      fieldErrors: { destination: "Select a destination." },
    };
  }
  if (!idempotencyParsed.ok) {
    return {
      ok: false,
      kind: "invalid",
      message: idempotencyParsed.error,
      fieldErrors: { idempotencyKey: idempotencyParsed.error },
    };
  }

  return buyPartnerEsimPurchase({
    partnerUserId: actor.userId,
    offerId,
    countryHint,
    idempotencyKey: idempotencyParsed.value,
    useWallet: resolved.useWallet,
    walletOperatorId: walletOperatorId || undefined,
    customerMsisdn: customerMsisdn || undefined,
  }).then((result) => {
    if (result.ok && result.kind === "checkout_redirect") {
      // Must stay outside try/catch — redirect() throws NEXT_REDIRECT.
      redirect(result.checkoutUrl);
    }
    return result;
  });
}

/**
 * Partner Add More Data: same Partner wallet / discount pipeline as Buy eSIM,
 * bound to an existing Partner-owned order via adddata_ idempotency key.
 * Browser may send only local orderId — never provider/recharge ids.
 */
export async function startPartnerAddDataCheckoutAction(
  _prev: PartnerPurchaseActionState,
  formData: FormData
): Promise<PartnerPurchaseActionState> {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return mapPartnerPurchaseErrorCode("PARTNER_UNAVAILABLE");
  }

  const localOrderId = normalizeAddDataFromOrderId(formData.get("orderId"));

  // Never trust browser-supplied VeSIM bind or commercial fields.
  void formData.get("rechargeOrderId");
  void formData.get("providerOrderId");
  void formData.get("offerId");
  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("retailPriceCents");
  void formData.get("discountBps");
  void formData.get("partnerChargeCents");
  void formData.get("providerCostCents");
  void formData.get("idempotencyKey");

  if (!localOrderId) {
    return {
      ok: false,
      kind: "invalid",
      message: "Add More Data is not available for this eSIM.",
    };
  }

  let detail: Awaited<ReturnType<typeof getPartnerOwnedOrderDetail>>;
  try {
    detail = await getPartnerOwnedOrderDetail(actor.userId, localOrderId);
  } catch {
    return mapPartnerPurchaseErrorCode("UNAVAILABLE");
  }

  if (!detail || !detail.addDataEligible) {
    return {
      ok: false,
      kind: "invalid",
      message: "Add More Data is not available for this eSIM.",
    };
  }

  const rechargeOrderId = await resolvePartnerOwnedRechargeOrderId({
    partnerUserId: actor.userId,
    localOrderId,
  });
  if (!rechargeOrderId) {
    return {
      ok: false,
      kind: "invalid",
      message: "Add More Data is not available for this eSIM.",
    };
  }

  const offerId = normalizeOfferId(detail.addDataOfferId);
  const countryHint =
    sanitizeCountryHint(detail.destinationCode) ||
    (offerId ? extractCountryHintFromOfferId(offerId) : null);

  if (!offerId) {
    return {
      ok: false,
      kind: "invalid",
      message: "Add More Data is not available for this eSIM.",
      fieldErrors: { offerId: "Add More Data is not available for this eSIM." },
    };
  }
  if (!countryHint) {
    return {
      ok: false,
      kind: "invalid",
      message: "Destination is unavailable for this eSIM top-up.",
      fieldErrors: {
        destination: "Destination is unavailable for this eSIM top-up.",
      },
    };
  }

  // Existing Partner wallet + discount buy; provider bind via adddata_ key.
  const idempotencyKey = await resolvePartnerAddDataIdempotencyKey({
    localOrderId,
    ownerId: actor.partnerId,
    offerId,
  });
  return buyPartnerEsimPurchase({
    partnerUserId: actor.userId,
    offerId,
    countryHint,
    idempotencyKey,
  });
}
