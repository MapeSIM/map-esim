/**
 * TEMPORARY DEV-ONLY email preview samples.
 * Do not commit. Safe sanitized fixtures only — no secrets / real install codes.
 */
import type { AbandonedCheckoutEmailPayload } from "@/app/lib/email/abandonedCheckoutTemplate";
import type { EsimLifecycleEmailPayload } from "@/app/lib/email/esimLifecycleTemplate";
import type { PaymentFailureEmailPayload } from "@/app/lib/email/paymentFailureTemplate";
import type { PaymentReceivedPendingEmailPayload } from "@/app/lib/email/paymentReceivedPendingTemplate";
import type {
  RefundStatusEmailKind,
  RefundStatusEmailPayload,
} from "@/app/lib/email/refundStatusTemplate";
import type { WalletTransactionEmailPayload } from "@/app/lib/email/walletTransactionTemplate";
import type { EsimLifecycleKind } from "@/app/lib/esim/esimLifecycleNotificationShared";

export const DEV_EMAIL_PREVIEW_TEMPLATES = [
  {
    id: "purchase-confirmation",
    label: "Purchase confirmation (wallet)",
  },
  {
    id: "abandoned-checkout",
    label: "Abandoned checkout recovery",
  },
  {
    id: "expiry-reminder",
    label: "Expiry reminder",
  },
  {
    id: "refund-status",
    label: "Refund status",
  },
  {
    id: "payment-received-pending",
    label: "Payment received / pending",
  },
  {
    id: "payment-failure",
    label: "Payment failure",
  },
] as const;

export type DevEmailPreviewTemplateId =
  (typeof DEV_EMAIL_PREVIEW_TEMPLATES)[number]["id"];

export const REFUND_STATUS_KINDS: RefundStatusEmailKind[] = [
  "received",
  "under_review",
  "approved_pending_execution",
  "rejected",
  "completed",
];

export const EXPIRY_REMINDER_KINDS: EsimLifecycleKind[] = [
  "EXPIRY_SOON_24H",
  "EXPIRED",
  "LOW_DATA",
  "DATA_EXHAUSTED",
];

export function isDevEmailPreviewTemplateId(
  value: string
): value is DevEmailPreviewTemplateId {
  return DEV_EMAIL_PREVIEW_TEMPLATES.some((t) => t.id === value);
}

export function samplePurchaseConfirmationPayload(): WalletTransactionEmailPayload {
  return {
    customerName: "Ada Lovelace",
    transactionTypeLabel: "eSIM purchase",
    amountLabel: "-$19.99",
    currencyLabel: "USD",
    description: "eSIM package purchase",
    orderReference: "ord_…9f2a",
    orderUrl: "https://mapesim.com/account/orders/ord_abc12345",
    transactionReference: "wt_…0001",
    previousBalanceLabel: "$50.00",
    newBalanceLabel: "$30.01",
    occurredAtLabel: "11 Sep 2026, 10:00 UTC",
    walletUrl: "https://mapesim.com/account/wallet",
  };
}

export function sampleAbandonedCheckoutPayload(): AbandonedCheckoutEmailPayload {
  return {
    customerName: "Ada Lovelace",
    purchaseReference: "purc…9f2a",
    planLabel: "1GB / 7 days",
    destinationLabel: "Turkey",
    amountLabel: "$12.99",
    currencyLabel: "USD",
    resumeCheckoutUrl:
      "https://mapesim.com/account/esim/buy?resume=sample-opaque-token",
  };
}

export function sampleExpiryReminderPayload(
  kind: EsimLifecycleKind = "EXPIRY_SOON_24H"
): EsimLifecycleEmailPayload {
  const byKind: Record<
    EsimLifecycleKind,
    Pick<
      EsimLifecycleEmailPayload,
      "expiryStatusLabel" | "expiryDateLabel" | "remainingDataLabel"
    >
  > = {
    EXPIRY_SOON_24H: {
      expiryStatusLabel: "Expires in about 24 hours",
      expiryDateLabel: "12 Sep 2026, 10:00 UTC",
      remainingDataLabel: "1.2 GB",
    },
    EXPIRED: {
      expiryStatusLabel: "Expired",
      expiryDateLabel: "11 Sep 2026, 10:00 UTC",
      remainingDataLabel: null,
    },
    LOW_DATA: {
      expiryStatusLabel: "Low data",
      expiryDateLabel: "20 Sep 2026, 10:00 UTC",
      remainingDataLabel: "0.2 GB (≤10%)",
    },
    DATA_EXHAUSTED: {
      expiryStatusLabel: "Data exhausted",
      expiryDateLabel: "20 Sep 2026, 10:00 UTC",
      remainingDataLabel: "0 GB",
    },
  };

  return {
    kind,
    customerName: "Ada Lovelace",
    destinationLabel: "Asia",
    planLabel: "3 GB · 30 Days",
    ...byKind[kind],
    myEsimUrl: "https://mapesim.com/account/orders",
    buyAnotherUrl: "https://mapesim.com/countries",
  };
}

export function sampleRefundStatusPayload(
  kind: RefundStatusEmailKind = "received"
): RefundStatusEmailPayload {
  return {
    kind,
    customerName: "Ada Lovelace",
    orderReference: "MAP-…9f2a",
    amountLabel: "$19.99",
    currencyLabel: "USD",
    orderUrl: "https://mapesim.com/account/orders/ord_abc12345",
    requestedAtLabel: "11 Sep 2026, 10:00 UTC",
    walletCreditedLabel: kind === "completed" ? "$19.99" : undefined,
  };
}

export function samplePaymentReceivedPendingPayload(): PaymentReceivedPendingEmailPayload {
  return {
    customerName: "Ada Lovelace",
    purchaseReference: "purc…9f2a",
    planLabel: "1GB / 7 days",
    destinationLabel: "Turkey",
    amountLabel: "$19.99",
    currencyLabel: "USD",
    accountOrdersUrl: "https://mapesim.com/account/orders",
  };
}

export function samplePaymentFailurePayload(): PaymentFailureEmailPayload {
  return {
    customerName: "Ada Lovelace",
    purchaseReference: "purc…9f2a",
    planLabel: "Europe 5GB",
    destinationLabel: "France",
    amountLabel: "$12.00",
    currencyLabel: "USD",
    occurredAtLabel: "11 Sep 2026, 10:00 UTC",
    walletFundsReturned: true,
    retryUrl: "https://mapesim.com/account/esim/buy",
  };
}
