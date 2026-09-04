import "server-only";

import {
  PaymentGatewayProvider,
  Role,
  WalletTopupStatus,
} from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";
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

export type CustomerTopupView = {
  topupId: string;
  status: WalletTopupStatus;
  statusLabel: string;
  creditAmountCents: number;
  creditAmountLabel: string;
  balanceLabel: string;
  chargeNotice: string;
  gatewayStatusLabel: string;
  failureMessage: string | null;
  createdAtLabel: string;
  paymentConfirmedAtLabel: string | null;
  walletCreditedAtLabel: string | null;
  canAttemptCheckout: boolean;
  /** Simpaisa Verify already sent — show waiting UI; do not re-show pay form. */
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

function statusLabel(status: WalletTopupStatus): string {
  switch (status) {
    case WalletTopupStatus.DRAFT:
      return "Draft";
    case WalletTopupStatus.AWAITING_PAYMENT:
      return "Awaiting payment";
    case WalletTopupStatus.PAYMENT_PENDING:
      return "Payment pending";
    case WalletTopupStatus.PAYMENT_CONFIRMED:
      return "Payment confirmed";
    case WalletTopupStatus.CREDITED:
      return "Credited";
    case WalletTopupStatus.FAILED:
      return "Failed";
    case WalletTopupStatus.EXPIRED:
      return "Expired";
    case WalletTopupStatus.CANCELLED:
      return "Cancelled";
    case WalletTopupStatus.RECONCILIATION_REQUIRED:
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

async function assertOwner(customerUserId: string, topupId: string) {
  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    notFound();
  }

  const row = await prisma.walletTopup.findUnique({
    where: { id: topupId },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
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
  if (!row || row.customerUserId !== customer.id) {
    notFound();
  }
  return row;
}

export async function getCustomerTopupView(
  customerUserId: string,
  topupId: string
): Promise<CustomerTopupView> {
  const id = topupId.trim();
  if (!id || id.length > 64) notFound();

  const row = await assertOwner(customerUserId, id);
  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerUserId },
    select: { balanceCents: true },
  });

  const hasQuote =
    typeof row.chargeAmountMinor === "number" &&
    Boolean(row.chargeCurrency?.trim());

  let failureMessage: string | null = null;
  if (row.status === WalletTopupStatus.FAILED) {
    failureMessage =
      "Payment was not completed or was rejected. No funds were added to your wallet.";
  } else if (row.status === WalletTopupStatus.EXPIRED) {
    failureMessage =
      "This payment request expired. No funds were added to your wallet.";
  } else if (row.status === WalletTopupStatus.CANCELLED) {
    failureMessage =
      "This top-up was cancelled. No funds were added to your wallet.";
  } else if (row.status === WalletTopupStatus.RECONCILIATION_REQUIRED) {
    failureMessage =
      "Your payment is under review. Please contact support and do not pay again for this top-up.";
  }

  const simpaisaWalletCheckout =
    isPaymentGatewayConfigured() &&
    getActivePaymentAdapter().provider === "SIMPAISA";
  const pkrQuote = quoteSimpaisaPkrChargeFromUsdCents(row.creditAmountCents);
  const pkrChargeLabel = pkrQuote
    ? formatSimpaisaPkrChargeLabel(pkrQuote.pkrRupees)
    : null;

  const gatewayRef = (row.gatewayPaymentRef ?? "").trim();
  const isSimpaisaSession =
    row.gatewayProvider === PaymentGatewayProvider.SIMPAISA &&
    Boolean(gatewayRef);
  const awaitingWalletApproval =
    isSimpaisaSession &&
    (row.status === WalletTopupStatus.AWAITING_PAYMENT ||
      row.status === WalletTopupStatus.PAYMENT_PENDING);

  const notExpired = !row.expiresAt || row.expiresAt.getTime() > Date.now();
  const canAttemptCheckout =
    notExpired &&
    (row.status === WalletTopupStatus.DRAFT ||
      (row.status === WalletTopupStatus.AWAITING_PAYMENT && !isSimpaisaSession));

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
    creditAmountCents: row.creditAmountCents,
    creditAmountLabel: formatUsdCents(row.creditAmountCents),
    balanceLabel: formatUsdCents(wallet?.balanceCents ?? 0),
    chargeNotice: hasQuote
      ? "Your secure checkout amount was confirmed by the payment provider."
      : "Your PKR payment amount will be confirmed securely at checkout.",
    gatewayStatusLabel: isPaymentGatewayConfigured()
      ? "Payment provider ready"
      : "Payment provider setup in progress",
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
    customerMsisdnMasked: (row.customerMsisdnMasked ?? "").trim() || null,
    pkrAmountLabel,
    isCredited: row.status === WalletTopupStatus.CREDITED,
    isPending:
      row.status === WalletTopupStatus.AWAITING_PAYMENT ||
      row.status === WalletTopupStatus.PAYMENT_PENDING ||
      row.status === WalletTopupStatus.PAYMENT_CONFIRMED ||
      row.status === WalletTopupStatus.DRAFT,
    isFailedOrExpired:
      row.status === WalletTopupStatus.FAILED ||
      row.status === WalletTopupStatus.EXPIRED ||
      row.status === WalletTopupStatus.CANCELLED,
    isReconciliation:
      row.status === WalletTopupStatus.RECONCILIATION_REQUIRED,
    simpaisaWalletCheckout,
    pkrChargeLabel,
  };
}
