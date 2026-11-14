/**
 * Customer Manual Payment pending-order creation (server-only).
 * Persists WHATSAPP_PENDING rows with paymentMethod=MANUAL for admin fulfill.
 * Does not call VeSIM — admin Verify & Issue triggers company-funded assignment.
 */
import "server-only";

import {
  OrderFundingSource,
  OrderStatus,
  Role,
  WalletEsimPurchaseStatus,
  WhatsAppCheckoutOrderStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { normalizeEmail } from "@/app/lib/auth/email";
import { getPublicManualPaymentConfig } from "@/app/lib/payments/manualPaymentConfig";
import {
  MANUAL_CHECKOUT_PAYMENT_METHOD,
  clipManualProofUrl,
  clipManualSenderName,
  generateManualOrderReference,
} from "@/app/lib/support/manualCheckoutOrderShared";
import { verifyOfferAuthoritative } from "@/app/lib/vesim/server";

export type CreateManualPendingOrderResult =
  | {
      success: true;
      pendingOrderId: string;
      orderId: string | null;
      reference: string;
      purchaseId: string | null;
    }
  | { success: false; error: string };

const CREATABLE_STATUSES: WalletEsimPurchaseStatus[] = [
  WalletEsimPurchaseStatus.DRAFT,
  WalletEsimPurchaseStatus.READY,
  WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
];

async function allocateUniqueReference(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = generateManualOrderReference(Date.now() + attempt);
    const existing = await prisma.whatsAppCheckoutOrder.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!existing) return reference;
  }
  return `MP-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

/**
 * Account checkout: link WalletEsimPurchase → MANUAL pending row for admin fulfill.
 */
export async function createManualPendingOrderFromPurchase(input: {
  customerUserId: string;
  purchaseId: string;
  senderName: string;
  proofUrl: string;
}): Promise<CreateManualPendingOrderResult> {
  const customerUserId = (input.customerUserId ?? "").trim();
  const purchaseId = (input.purchaseId ?? "").trim();
  const senderName = clipManualSenderName(input.senderName);
  const proofUrl = clipManualProofUrl(input.proofUrl);

  if (!customerUserId || customerUserId.length > 64) {
    return { success: false, error: "Not authorized." };
  }
  if (!purchaseId || purchaseId.length > 64) {
    return { success: false, error: "Checkout session is unavailable." };
  }
  if (!senderName) {
    return { success: false, error: "Enter the sender account name or mobile number." };
  }
  if (!proofUrl) {
    return { success: false, error: "Upload a valid payment proof screenshot." };
  }

  const config = await getPublicManualPaymentConfig();
  if (!config.enabled) {
    return {
      success: false,
      error: "Manual payment is not available right now.",
    };
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, email: true, role: true, deletedAt: true },
  });
  const customerEmail = normalizeEmail(customer?.email ?? "");
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
      error: "This checkout can no longer be submitted as a manual payment.",
    };
  }

  const existing = await prisma.whatsAppCheckoutOrder.findFirst({
    where: {
      walletEsimPurchaseId: purchase.id,
      customerUserId: customer.id,
      status: WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING,
      paymentMethod: MANUAL_CHECKOUT_PAYMENT_METHOD,
    },
    orderBy: { createdAt: "desc" },
  });

  const amountCents = Math.max(
    0,
    Math.trunc(purchase.priceCents) -
      Math.max(0, Math.trunc(purchase.promoDiscountCents)) -
      Math.max(0, Math.trunc(purchase.rewardPointsRedeemed))
  );
  const currency = (purchase.currency || "USD").trim() || "USD";

  let row = existing;
  if (!row) {
    const reference = await allocateUniqueReference();
    row = await prisma.whatsAppCheckoutOrder.create({
      data: {
        reference,
        status: WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING,
        paymentMethod: MANUAL_CHECKOUT_PAYMENT_METHOD,
        customerUserId: customer.id,
        customerEmail,
        senderName,
        paymentProofUrl: proofUrl,
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
  } else {
    row = await prisma.whatsAppCheckoutOrder.update({
      where: { id: row.id },
      data: { senderName, paymentProofUrl: proofUrl },
    });
  }

  // Local Order snapshot (PENDING) so it appears under Admin → Orders immediately.
  const providerOrderId = `manual-${row.reference}`.slice(0, 120);
  const order = await prisma.order.upsert({
    where: { providerOrderId },
    create: {
      providerOrderId,
      userId: customer.id,
      customerEmail,
      offerId: purchase.offerId,
      destination:
        purchase.destinationName || purchase.destinationCode || null,
      planName: purchase.planName || "eSIM package",
      dataAllowance: purchase.dataAllowance,
      validity: purchase.validity,
      displayAmount: amountCents / 100,
      displayCurrency: currency,
      fundingSource: OrderFundingSource.DIRECT_PAYMENT,
      status: OrderStatus.PENDING,
      paymentMethod: MANUAL_CHECKOUT_PAYMENT_METHOD,
      senderName,
      paymentProofUrl: proofUrl,
      claimStatus: "UNCLAIMED",
    },
    update: {
      senderName,
      paymentProofUrl: proofUrl,
      paymentMethod: MANUAL_CHECKOUT_PAYMENT_METHOD,
      status: OrderStatus.PENDING,
    },
  });

  if (!row.orderId) {
    await prisma.whatsAppCheckoutOrder.update({
      where: { id: row.id },
      data: { orderId: order.id },
    });
  }

  return {
    success: true,
    pendingOrderId: row.id,
    orderId: order.id,
    reference: row.reference,
    purchaseId: purchase.id,
  };
}

/**
 * Guest / public checkout manual payment — PENDING Order only.
 * When a matching customer account exists, also create a fulfillable pending row.
 */
export async function createManualPendingOrderFromGuest(input: {
  offerId: string;
  customerEmail: string;
  senderName: string;
  proofUrl: string;
  countryHint?: string | null;
}): Promise<CreateManualPendingOrderResult> {
  const offerId = (input.offerId ?? "").trim();
  const customerEmail = normalizeEmail(input.customerEmail);
  const senderName = clipManualSenderName(input.senderName);
  const proofUrl = clipManualProofUrl(input.proofUrl);
  const countryHint = (input.countryHint ?? "").trim() || null;

  if (!offerId || offerId.length > 120) {
    return { success: false, error: "Plan is unavailable." };
  }
  if (!customerEmail) {
    return { success: false, error: "Please provide a valid email address." };
  }
  if (!senderName) {
    return {
      success: false,
      error: "Enter the sender account name or mobile number.",
    };
  }
  if (!proofUrl) {
    return { success: false, error: "Upload a valid payment proof screenshot." };
  }

  const config = await getPublicManualPaymentConfig();
  if (!config.enabled) {
    return {
      success: false,
      error: "Manual payment is not available right now.",
    };
  }

  const verified = await verifyOfferAuthoritative({
    offerId,
    countryHint,
  });
  if (!verified) {
    return { success: false, error: "Plan unavailable." };
  }

  const validity =
    verified.durationDays != null ? `${verified.durationDays} Days` : null;
  const reference = await allocateUniqueReference();
  const providerOrderId = `manual-${reference}`.slice(0, 120);

  const customer = await prisma.user.findFirst({
    where: {
      email: customerEmail,
      role: Role.CUSTOMER,
      deletedAt: null,
    },
    select: { id: true },
  });

  const order = await prisma.order.create({
    data: {
      providerOrderId,
      userId: customer?.id ?? null,
      customerEmail,
      offerId: verified.offerId,
      destination: verified.countryName || verified.countryCode || null,
      planName: verified.name || "eSIM package",
      dataAllowance: verified.dataFormatted || null,
      validity,
      providerAmount: verified.providerPriceUSD,
      providerCurrency: verified.currency || "USD",
      displayAmount: verified.priceUSD,
      displayCurrency: verified.currency || "USD",
      fundingSource: OrderFundingSource.DIRECT_PAYMENT,
      status: OrderStatus.PENDING,
      paymentMethod: MANUAL_CHECKOUT_PAYMENT_METHOD,
      senderName,
      paymentProofUrl: proofUrl,
      claimStatus: "UNCLAIMED",
    },
  });

  let pendingOrderId = order.id;
  if (customer) {
    const amountCents = Math.max(
      0,
      Math.round(Number(verified.priceUSD || 0) * 100)
    );
    const pending = await prisma.whatsAppCheckoutOrder.create({
      data: {
        reference,
        status: WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING,
        paymentMethod: MANUAL_CHECKOUT_PAYMENT_METHOD,
        customerUserId: customer.id,
        customerEmail,
        senderName,
        paymentProofUrl: proofUrl,
        offerId: verified.offerId,
        destinationCode: verified.countryCode,
        destinationName: verified.countryName,
        planName: verified.name || "eSIM package",
        dataAllowance: verified.dataFormatted || null,
        validity,
        amountCents,
        currency: verified.currency || "USD",
        orderId: order.id,
      },
    });
    pendingOrderId = pending.id;
  }

  return {
    success: true,
    pendingOrderId,
    orderId: order.id,
    reference,
    purchaseId: null,
  };
}
