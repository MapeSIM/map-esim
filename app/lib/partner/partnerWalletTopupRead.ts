import "server-only";

import {
  PaymentGatewayProvider,
  PartnerWalletTopupStatus,
  Role,
} from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  getActivePaymentAdapter,
  isPaymentGatewayConfigured,
} from "@/app/lib/payments/disabledAdapter";
import {
  SIMPAISA_WALLET_OPERATORS,
  isSimpaisaWalletOperatorId,
  simpaisaMajorAmountFromMinor,
} from "@/app/lib/payments/simpaisaPolicy";
import {
  formatSimpaisaPkrChargeLabel,
  quoteSimpaisaPkrChargeFromUsdCents,
} from "@/app/lib/payments/simpaisaPkrQuote";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";

export type PartnerTopupView = {
  topupId: string;
  status: PartnerWalletTopupStatus;
  statusLabel: string;
  baseAmountCents: number;
  baseAmountLabel: string;
  processingFeeAmountCents: number;
  totalPayableCents: number;
  feePolicyVersion: string | null;
  balanceLabel: string;
  chargeNotice: string;
  gatewayStatusLabel: string;
  failureMessage: string | null;
  createdAtLabel: string;
  paymentConfirmedAtLabel: string | null;
  walletCreditedAtLabel: string | null;
  canAttemptCheckout: boolean;
  awaitingWalletApproval: boolean;
  paymentMethodLabel: string | null;
  customerMsisdnMasked: string | null;
  pkrAmountLabel: string | null;
  isCredited: boolean;
  isPending: boolean;
  isFailedOrExpired: boolean;
  isReconciliation: boolean;
  simpaisaWalletCheckout: boolean;
  pkrChargeLabel: string | null;
};

function statusLabel(status: PartnerWalletTopupStatus): string {
  switch (status) {
    case PartnerWalletTopupStatus.DRAFT:
      return "Draft";
    case PartnerWalletTopupStatus.AWAITING_PAYMENT:
      return "Awaiting payment";
    case PartnerWalletTopupStatus.PAYMENT_PENDING:
      return "Payment pending";
    case PartnerWalletTopupStatus.PAYMENT_CONFIRMED:
      return "Payment confirmed";
    case PartnerWalletTopupStatus.CREDITED:
      return "Credited";
    case PartnerWalletTopupStatus.FAILED:
      return "Failed";
    case PartnerWalletTopupStatus.EXPIRED:
      return "Expired";
    case PartnerWalletTopupStatus.CANCELLED:
      return "Cancelled";
    case PartnerWalletTopupStatus.RECONCILIATION_REQUIRED:
      return "Under review";
    default:
      return "Unavailable";
  }
}

function paymentMethodLabelForOperator(
  operatorId: string | null | undefined
): string | null {
  const id = (operatorId ?? "").trim();
  if (!id || !isSimpaisaWalletOperatorId(id)) return null;
  if (id === SIMPAISA_WALLET_OPERATORS.EASYPAISA) return "Easypaisa";
  if (id === SIMPAISA_WALLET_OPERATORS.JAZZCASH) return "JazzCash";
  return null;
}

async function assertPartnerOwner(partnerUserId: string, topupId: string) {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) notFound();

  const user = await prisma.user.findUnique({
    where: { id: partnerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt || user.role !== Role.PARTNER) {
    notFound();
  }

  const row = await prisma.partnerWalletTopup.findUnique({
    where: { id: topupId },
    select: {
      id: true,
      partnerId: true,
      baseAmountCents: true,
      processingFeeAmountCents: true,
      totalPayableCents: true,
      feePolicyVersion: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      status: true,
      failureCategory: true,
      createdAt: true,
      paymentConfirmedAt: true,
      walletCreditedAt: true,
      expiresAt: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      walletOperatorId: true,
      customerMsisdnMasked: true,
    },
  });
  if (!row || row.partnerId !== actor.partnerId) {
    notFound();
  }
  return row;
}

export async function getPartnerTopupView(
  partnerUserId: string,
  topupId: string
): Promise<PartnerTopupView> {
  const id = topupId.trim();
  if (!id || id.length > 64) notFound();

  const row = await assertPartnerOwner(partnerUserId, id);
  const wallet = await prisma.partnerWalletAccount.findUnique({
    where: { partnerId: row.partnerId },
    select: { balanceCents: true },
  });

  const hasQuote =
    typeof row.chargeAmountMinor === "number" &&
    Boolean(row.chargeCurrency?.trim());

  let failureMessage: string | null = null;
  if (row.status === PartnerWalletTopupStatus.FAILED) {
    failureMessage =
      "Payment was not completed or was rejected. No funds were added to your Partner wallet.";
  } else if (row.status === PartnerWalletTopupStatus.EXPIRED) {
    failureMessage =
      "This payment request expired. No funds were added to your Partner wallet.";
  } else if (row.status === PartnerWalletTopupStatus.CANCELLED) {
    failureMessage =
      "This top-up was cancelled. No funds were added to your Partner wallet.";
  } else if (row.status === PartnerWalletTopupStatus.RECONCILIATION_REQUIRED) {
    failureMessage =
      "Your payment is under review. Please contact support and do not pay again for this top-up.";
  }

  const simpaisaWalletCheckout =
    isPaymentGatewayConfigured() &&
    getActivePaymentAdapter().provider === "SIMPAISA";
  const pkrQuote = quoteSimpaisaPkrChargeFromUsdCents(row.totalPayableCents);
  const pkrChargeLabel = pkrQuote
    ? formatSimpaisaPkrChargeLabel(pkrQuote.pkrRupees)
    : null;

  const gatewayRef = (row.gatewayPaymentRef ?? "").trim();
  const isSimpaisaSession =
    row.gatewayProvider === PaymentGatewayProvider.SIMPAISA &&
    Boolean(gatewayRef);
  const awaitingWalletApproval =
    isSimpaisaSession &&
    (row.status === PartnerWalletTopupStatus.AWAITING_PAYMENT ||
      row.status === PartnerWalletTopupStatus.PAYMENT_PENDING);

  const notExpired = !row.expiresAt || row.expiresAt.getTime() > Date.now();
  const canAttemptCheckout =
    notExpired &&
    (row.status === PartnerWalletTopupStatus.DRAFT ||
      (row.status === PartnerWalletTopupStatus.AWAITING_PAYMENT &&
        !isSimpaisaSession));

  let pkrAmountLabel: string | null = null;
  if (
    hasQuote &&
    (row.chargeCurrency ?? "").trim().toUpperCase() === "PKR" &&
    typeof row.chargeAmountMinor === "number"
  ) {
    const major = simpaisaMajorAmountFromMinor(row.chargeAmountMinor);
    pkrAmountLabel = major ? formatSimpaisaPkrChargeLabel(Number(major)) : null;
  }
  if (!pkrAmountLabel) pkrAmountLabel = pkrChargeLabel;

  const methodLabel = paymentMethodLabelForOperator(row.walletOperatorId);

  return {
    topupId: row.id,
    status: row.status,
    statusLabel: awaitingWalletApproval
      ? "Awaiting approval"
      : statusLabel(row.status),
    baseAmountCents: row.baseAmountCents,
    baseAmountLabel: formatUsdCents(row.baseAmountCents),
    processingFeeAmountCents: row.processingFeeAmountCents,
    totalPayableCents: row.totalPayableCents,
    feePolicyVersion: row.feePolicyVersion,
    balanceLabel: formatUsdCents(wallet?.balanceCents ?? 0),
    chargeNotice: hasQuote
      ? "Your secure checkout amount was confirmed by the payment provider."
      : "PKR charge is confirmed when you continue to payment.",
    gatewayStatusLabel: isPaymentGatewayConfigured()
      ? "Payment provider ready"
      : "Payment provider unavailable",
    failureMessage,
    createdAtLabel: formatWalletDateTime(row.createdAt),
    paymentConfirmedAtLabel: row.paymentConfirmedAt
      ? formatWalletDateTime(row.paymentConfirmedAt)
      : null,
    walletCreditedAtLabel: row.walletCreditedAt
      ? formatWalletDateTime(row.walletCreditedAt)
      : null,
    canAttemptCheckout,
    awaitingWalletApproval,
    paymentMethodLabel: methodLabel,
    customerMsisdnMasked: row.customerMsisdnMasked,
    pkrAmountLabel,
    isCredited: row.status === PartnerWalletTopupStatus.CREDITED,
    isPending:
      row.status === PartnerWalletTopupStatus.DRAFT ||
      row.status === PartnerWalletTopupStatus.AWAITING_PAYMENT ||
      row.status === PartnerWalletTopupStatus.PAYMENT_PENDING ||
      row.status === PartnerWalletTopupStatus.PAYMENT_CONFIRMED,
    isFailedOrExpired:
      row.status === PartnerWalletTopupStatus.FAILED ||
      row.status === PartnerWalletTopupStatus.EXPIRED ||
      row.status === PartnerWalletTopupStatus.CANCELLED,
    isReconciliation:
      row.status === PartnerWalletTopupStatus.RECONCILIATION_REQUIRED,
    simpaisaWalletCheckout,
    pkrChargeLabel,
  };
}
