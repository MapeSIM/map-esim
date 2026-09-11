/**
 * Partner Add More Data — server-only ownership + VeSIM recharge bind.
 * Never expose providerOrderId / rechargeOrderId on Partner DTOs or to the browser.
 */
import "server-only";

import {
  OrderStatus,
  PartnerEsimPurchaseStatus,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  isEncryptedOrderIccidExpiredForAddData,
  normalizeAddDataFromOrderId,
} from "@/app/lib/esim/addDataCheckout";
import {
  buildAddDataEligibility,
  lookupOfferTopUpFromCatalog,
} from "@/app/lib/orders/customerOrders";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { partnerOrderStatusFromPurchase } from "@/app/lib/partner/partnerOrdersDisplay";
import { normalizeOfferId } from "@/app/lib/vesim/server";

/**
 * Resolve VeSIM rechargeOrderId for a Partner-owned MAP local order.
 *
 * Verifies active PARTNER actor, PartnerEsimPurchase ownership, and shared
 * Add More Data eligibility. Returns the Order.providerOrderId (preferred)
 * for use as rechargeOrderId — never the MAP local order id.
 *
 * Returns null when missing, unauthorized, or ineligible (fail closed).
 * Do not call from Partner UI DTOs.
 */
export async function resolvePartnerOwnedRechargeOrderId(options: {
  partnerUserId: string;
  localOrderId: string;
}): Promise<string | null> {
  const partnerUserId = (options.partnerUserId ?? "").trim();
  const localOrderId = normalizeAddDataFromOrderId(options.localOrderId);
  if (!partnerUserId || partnerUserId.length > 64 || !localOrderId) {
    return null;
  }

  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) return null;

  // Defense-in-depth: session user must still be PARTNER.
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt || user.role !== Role.PARTNER) {
    return null;
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: actor.partnerId,
      orderId: localOrderId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
    },
    select: {
      status: true,
      offerId: true,
      destinationCode: true,
      providerOrderId: true,
      order: {
        select: {
          status: true,
          offerId: true,
          providerOrderId: true,
          iccidEncrypted: true,
        },
      },
    },
  });

  if (!purchase?.order) return null;

  const order = purchase.order;
  const statusBadge = partnerOrderStatusFromPurchase(purchase.status);
  const isRefunded = statusBadge === "Failed — balance returned";
  const installEligible =
    order.status === OrderStatus.COMPLETED &&
    purchase.status === PartnerEsimPurchaseStatus.COMPLETED &&
    statusBadge === "Completed";

  const offerId =
    normalizeOfferId(purchase.offerId) ||
    normalizeOfferId(order.offerId) ||
    null;
  /** VeSIM bind key only — never MAP local order id. */
  const providerOrderId =
    (order.providerOrderId ?? "").trim() ||
    (purchase.providerOrderId ?? "").trim() ||
    null;
  const destinationCode = (purchase.destinationCode ?? "").trim() || null;

  const catalog = await lookupOfferTopUpFromCatalog(
    offerId,
    destinationCode,
    new Map()
  );
  const addData = buildAddDataEligibility({
    providerOrderId,
    offerId,
    isRefunded,
    installEligible,
    catalog,
  });

  if (!addData.addDataEligible) return null;

  if (await isEncryptedOrderIccidExpiredForAddData(order.iccidEncrypted)) {
    return null;
  }

  const rechargeOrderId = (addData.rechargeOrderId ?? "").trim();
  return rechargeOrderId || null;
}
