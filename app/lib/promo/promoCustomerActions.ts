"use server";

import { Role } from "@prisma/client";
import { requireRole } from "@/app/lib/auth/session";
import {
  applyPromoToCustomerPurchase,
  customerPromoErrorMessage,
  removePromoFromCustomerPurchase,
} from "@/app/lib/promo/promoCustomer";
import { PROMO_CUSTOMER_MESSAGES } from "@/app/lib/promo/promoMessages";
import { PromoEvaluateError } from "@/app/lib/promo/promoEvaluate";

export type PromoCheckoutActionState =
  | { ok: true }
  | { ok: false; error: string };

export const initialPromoCheckoutState: PromoCheckoutActionState = { ok: true };

export async function applyCustomerPromoAction(
  _prev: PromoCheckoutActionState,
  formData: FormData
): Promise<PromoCheckoutActionState> {
  const user = await requireRole("CUSTOMER");
  if (user.role === Role.PARTNER) {
    return { ok: false, error: PROMO_CUSTOMER_MESSAGES.PARTNER_REJECTED };
  }

  void formData.get("discountCents");
  void formData.get("finalPriceCents");
  void formData.get("percent");
  void formData.get("priceCents");

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const code = String(formData.get("promoCode") ?? "");
  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: PROMO_CUSTOMER_MESSAGES.UNAVAILABLE };
  }

  try {
    await applyPromoToCustomerPurchase({
      customerUserId: user.id,
      purchaseId,
      code,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: customerPromoErrorMessage(error) };
  }
}

export async function removeCustomerPromoAction(
  _prev: PromoCheckoutActionState,
  formData: FormData
): Promise<PromoCheckoutActionState> {
  const user = await requireRole("CUSTOMER");
  if (user.role === Role.PARTNER) {
    return { ok: false, error: PROMO_CUSTOMER_MESSAGES.PARTNER_REJECTED };
  }

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  if (!purchaseId || purchaseId.length > 64) {
    return { ok: false, error: PROMO_CUSTOMER_MESSAGES.UNAVAILABLE };
  }

  try {
    await removePromoFromCustomerPurchase({
      customerUserId: user.id,
      purchaseId,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof PromoEvaluateError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: PROMO_CUSTOMER_MESSAGES.UNAVAILABLE };
  }
}
