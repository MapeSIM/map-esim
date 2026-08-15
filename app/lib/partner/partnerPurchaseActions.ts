"use server";

import { requireRole } from "@/app/lib/auth/session";
import { parseWalletPurchaseIdempotencyKey } from "@/app/lib/esim/walletPurchaseValidation";
import {
  listPartnerCatalogOffers,
  type PartnerCatalogOffer,
} from "@/app/lib/partner/partnerCatalogRead";
import { buyPartnerEsimPurchase } from "@/app/lib/partner/partnerPurchaseBuy";
import {
  mapPartnerPurchaseErrorCode,
  type PartnerPurchaseActionState,
} from "@/app/lib/partner/partnerPurchaseFormState";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
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
