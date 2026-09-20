/**
 * Pure helpers for admin test-data cleanup preview (Phase 1).
 * Read-only classification only — no mutations, no Prisma.
 */
import {
  EsimPurchasePaymentAttemptStatus,
  PartnerWalletTopupStatus,
  WalletTopupStatus,
} from "@prisma/client";

export const ADMIN_TEST_DATA_CLEANUP_HREF = "/admin/test-data-cleanup";

export const TEST_DATA_CLEANUP_PREVIEW_WARNING =
  "This page only previews removable test operational data. No records are deleted.";

/** Pending gateway attempt statuses (admin pending list). */
export const TEST_DATA_CLEANUP_PENDING_ATTEMPT_STATUSES = [
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
] as const;

/** Failed gateway attempt status. */
export const TEST_DATA_CLEANUP_FAILED_ATTEMPT_STATUSES = [
  EsimPurchasePaymentAttemptStatus.FAILED,
] as const;

export function isCreditedWalletTopupStatus(status: string): boolean {
  return status === WalletTopupStatus.CREDITED;
}

export function isCreditedPartnerWalletTopupStatus(status: string): boolean {
  return status === PartnerWalletTopupStatus.CREDITED;
}

/**
 * Non-credited topup candidate: not CREDITED and no credit ledger link.
 * Credited / ledger-linked rows stay protected in Phase 1.
 */
export function isNonCreditedTopupCandidate(input: {
  status: string;
  walletTransactionId?: string | null;
}): boolean {
  if (input.walletTransactionId) return false;
  if (isCreditedWalletTopupStatus(input.status)) return false;
  if (isCreditedPartnerWalletTopupStatus(input.status)) return false;
  return true;
}

export type TestDataCleanupPreviewCounts = {
  paymentWebhookReceipts: number;
  alertNotificationStates: number;
  alertNotificationDeliveries: number;
  paymentAttemptsTotal: number;
  paymentAttemptsPending: number;
  paymentAttemptsFailed: number;
  refundRequests: number;
  partnerRefundRequests: number;
  walletTopupsNonCredited: number;
  walletTopupsCreditedProtected: number;
  partnerWalletTopupsNonCredited: number;
  partnerWalletTopupsCreditedProtected: number;
  customersProtected: number;
  partnersProtected: number;
  ordersProtected: number;
  generatedAtLabel: string;
};
