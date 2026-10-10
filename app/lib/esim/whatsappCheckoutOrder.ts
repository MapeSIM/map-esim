/**
 * Customer WhatsApp checkout pending-order creation (server-only).
 * Does not reserve wallet funds or call the payment gateway.
 */
import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
  WhatsAppCheckoutOrderStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  WHATSAPP_CHECKOUT_PAYMENT_METHOD,
  buildWhatsAppPendingOrderHref,
  cleanWhatsAppCustomerPhoneDigits,
  generateWhatsAppOrderReference,
} from "@/app/lib/support/whatsappCheckoutOrderShared";
import { getWhatsAppCheckoutSettings } from "@/app/lib/support/whatsappSupport";
import { parseWhatsAppPhoneDigits } from "@/app/lib/support/whatsappSupportShared";

export type CreateWhatsAppPendingOrderResult =
  | {
      success: true;
      redirectUrl: string;
      orderReference: string;
      orderId: string;
    }
  | { success: false; error: string };

const CREATABLE_STATUSES: WalletEsimPurchaseStatus[] = [
  WalletEsimPurchaseStatus.DRAFT,
  WalletEsimPurchaseStatus.READY,
  WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
];

async function allocateUniqueReference(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = generateWhatsAppOrderReference(Date.now() + attempt);
    const existing = await prisma.whatsAppCheckoutOrder.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!existing) return reference;
  }
  return `WA-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

/**
 * Persist a WHATSAPP_PENDING checkout order from a customer wallet purchase draft,
 * then return the wa.me redirect URL with order reference prefilled.
 */
export async function createWhatsAppPendingOrder(input: {
  customerUserId: string;
  purchaseId: string;
  /** Digits-only customer WhatsApp (E.164 without +). Required. */
  whatsappPhone: string;
}): Promise<CreateWhatsAppPendingOrderResult> {
  const customerUserId = (input.customerUserId ?? "").trim();
  const purchaseId = (input.purchaseId ?? "").trim();
  if (!customerUserId || customerUserId.length > 64) {
    return { success: false, error: "Not authorized." };
  }
  if (!purchaseId || purchaseId.length > 64) {
    return { success: false, error: "Checkout session is unavailable." };
  }

  const phoneParsed = parseWhatsAppPhoneDigits(input.whatsappPhone);
  if (!phoneParsed.ok) {
    return { success: false, error: phoneParsed.error };
  }
  const whatsappPhone = phoneParsed.digits;

  const settings = await getWhatsAppCheckoutSettings();
  if (!settings.enabled || !settings.phoneDigits) {
    return {
      success: false,
      error: "WhatsApp checkout is not available right now.",
    };
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, email: true, role: true, deletedAt: true },
  });
  const customerEmail = (customer?.email ?? "").trim().toLowerCase();
  if (
    !customer ||
    customer.deletedAt ||
    customer.role !== Role.CUSTOMER ||
    !customerEmail
  ) {
    return { success: false, error: "Not authorized." };
  }

  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      customerUserId: true,
      offerId: true,
      destinationCode: true,
      destinationName: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      priceCents: true,
      promoDiscountCents: true,
      rewardPointsRedeemed: true,
      currency: true,
      status: true,
      fundingSource: true,
      orderId: true,
    },
  });

  if (
    !purchase ||
    purchase.customerUserId !== customer.id ||
    purchase.orderId ||
    !CREATABLE_STATUSES.includes(purchase.status) ||
    (purchase.fundingSource !== OrderFundingSource.CUSTOMER_WALLET &&
      purchase.fundingSource !== OrderFundingSource.CUSTOMER_SPLIT &&
      purchase.fundingSource !== OrderFundingSource.DIRECT_PAYMENT)
  ) {
    return {
      success: false,
      error: "This checkout can no longer be continued via WhatsApp.",
    };
  }

  // Reuse an open pending row for the same purchase (idempotent re-click).
  const existing = await prisma.whatsAppCheckoutOrder.findFirst({
    where: {
      walletEsimPurchaseId: purchase.id,
      customerUserId: customer.id,
      status: WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING,
    },
    orderBy: { createdAt: "desc" },
  });

  const amountCents = Math.max(
    0,
    Math.trunc(purchase.priceCents) -
      Math.max(0, Math.trunc(purchase.promoDiscountCents)) -
      Math.max(0, Math.trunc(purchase.rewardPointsRedeemed))
  );
  const destination =
    (purchase.destinationName || purchase.destinationCode || "").trim() ||
    "Not available";
  const amountLabel = formatUsdCents(amountCents);
  const currency = (purchase.currency || "USD").trim() || "USD";

  let row = existing;
  if (!row) {
    const reference = await allocateUniqueReference();
    row = await prisma.whatsAppCheckoutOrder.create({
      data: {
        reference,
        status: WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING,
        paymentMethod: WHATSAPP_CHECKOUT_PAYMENT_METHOD,
        customerUserId: customer.id,
        customerEmail,
        whatsappPhone,
        offerId: purchase.offerId,
        destinationCode: purchase.destinationCode,
        destinationName: purchase.destinationName,
        planName: purchase.planName || "eSIM package",
        dataAllowance: purchase.dataAllowance,
        validity: purchase.validity,
        amountCents,
        currency,
        walletEsimPurchaseId: purchase.id,
      },
    });
  } else if (
    cleanWhatsAppCustomerPhoneDigits(row.whatsappPhone) !== whatsappPhone
  ) {
    row = await prisma.whatsAppCheckoutOrder.update({
      where: { id: row.id },
      data: { whatsappPhone },
    });
  }

  const redirectUrl = buildWhatsAppPendingOrderHref(settings.phoneDigits, {
    reference: row.reference,
    destination,
    planName: row.planName,
    dataAllowance: row.dataAllowance ?? "Not available",
    validity: row.validity ?? "Not available",
    amountLabel,
    currency,
    customerEmail: row.customerEmail,
  });

  if (!redirectUrl) {
    return {
      success: false,
      error: "Could not build the WhatsApp link. Please try again shortly.",
    };
  }

  return {
    success: true,
    redirectUrl,
    orderReference: row.reference,
    orderId: row.id,
  };
}
