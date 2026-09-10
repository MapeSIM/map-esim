"use server";

import { requireRole } from "@/app/lib/auth/session";
import {
  buildAddDataIdempotencyKey,
  normalizeAddDataFromOrderId,
} from "@/app/lib/esim/addDataCheckout";
import { parseWalletPurchaseIdempotencyKey } from "@/app/lib/esim/walletPurchaseValidation";
import {
  listPartnerCatalogOffers,
  type PartnerCatalogOffer,
} from "@/app/lib/partner/partnerCatalogRead";
import { resolvePartnerOwnedRechargeOrderId } from "@/app/lib/partner/partnerAddDataCheckout";
import { getPartnerOwnedOrderDetail } from "@/app/lib/partner/partnerOrders";
import { buyPartnerEsimPurchase } from "@/app/lib/partner/partnerPurchaseBuy";
import {
  mapPartnerPurchaseErrorCode,
  type PartnerPurchaseActionState,
} from "@/app/lib/partner/partnerPurchaseFormState";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  extractCountryHintFromOfferId,
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

/**
 * Load MAP retail offers for Partner catalog (no provider cost / discount).
 */
export async function loadPartnerCatalogOffersAction(
  destinationCode: string
): Promise<PartnerCatalogOffer[]> {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) return [];
  return listPartnerCatalogOffers(destinationCode);
}

/**
 * Partner buy: prepare → reserve → provider.
 * Accepts only offerId + destination hint + idempotency key.
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
  return buyPartnerEsimPurchase({
    partnerUserId: actor.userId,
    offerId,
    countryHint,
    idempotencyKey: buildAddDataIdempotencyKey(localOrderId),
  });
}
