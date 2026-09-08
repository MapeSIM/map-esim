/**
 * Read-only admin inbox of PaymentWebhookReceipt rows.
 * Never funds, never replays, never calls VeSIM, never enables the gateway.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  PAYMENT_WEBHOOK_RECEIPTS_LIMIT,
  formatWebhookReceiptOutcome,
  webhookReceiptParseLabel,
  webhookReceiptSignatureLabel,
} from "@/app/lib/admin/paymentWebhookReceiptsShared";

export type AdminPaymentWebhookReceiptRow = {
  id: string;
  receivedAtLabel: string;
  providerLabel: string;
  eventIdLabel: string;
  eventTypeLabel: string;
  signatureLabel: string;
  parseLabel: string;
  httpStatusLabel: string;
  logCode: string;
  outcomeLabel: string;
  trackerMasked: string;
  paymentAttemptId: string | null;
  topupId: string | null;
  attemptHref: string | null;
  topupHref: string | null;
};

function mapWebhookReceiptRow(row: {
  id: string;
  receivedAt: Date;
  provider: string;
  eventId: string | null;
  eventType: string | null;
  signatureOk: boolean;
  parseOk: boolean;
  httpStatus: number;
  logCode: string;
  errorCategory: string | null;
  applyOutcome: string | null;
  paymentAttemptId: string | null;
  topupId: string | null;
  trackerMasked: string | null;
}): AdminPaymentWebhookReceiptRow {
  const paymentAttemptId = (row.paymentAttemptId ?? "").trim() || null;
  const topupId = (row.topupId ?? "").trim() || null;
  return {
    id: row.id,
    receivedAtLabel: formatUtcTimestamp(row.receivedAt),
    providerLabel: row.provider,
    eventIdLabel: (row.eventId ?? "").trim() || "Not available",
    eventTypeLabel: (row.eventType ?? "").trim() || "Not available",
    signatureLabel: webhookReceiptSignatureLabel(row.signatureOk),
    parseLabel: webhookReceiptParseLabel(row.parseOk),
    httpStatusLabel: String(row.httpStatus),
    logCode: row.logCode,
    outcomeLabel: formatWebhookReceiptOutcome(
      row.logCode,
      row.applyOutcome,
      row.errorCategory
    ),
    trackerMasked: (row.trackerMasked ?? "").trim() || "Not available",
    paymentAttemptId,
    topupId,
    attemptHref: paymentAttemptId
      ? `/admin/payments/${paymentAttemptId}`
      : null,
    topupHref: topupId ? `/admin/wallet-topups/${topupId}` : null,
  };
}

const WEBHOOK_RECEIPT_SELECT = {
  id: true,
  receivedAt: true,
  provider: true,
  eventId: true,
  eventType: true,
  signatureOk: true,
  parseOk: true,
  httpStatus: true,
  logCode: true,
  errorCategory: true,
  applyOutcome: true,
  paymentAttemptId: true,
  topupId: true,
  trackerMasked: true,
} as const;

export async function listPaymentWebhookReceipts(
  limit = 40
): Promise<AdminPaymentWebhookReceiptRow[]> {
  const take = Math.min(Math.max(limit, 1), PAYMENT_WEBHOOK_RECEIPTS_LIMIT);
  const rows = await prisma.paymentWebhookReceipt.findMany({
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take,
    select: WEBHOOK_RECEIPT_SELECT,
  });

  return rows.map(mapWebhookReceiptRow);
}

/**
 * Read-only receipts claimed for a single payment attempt.
 * Never replays, never applies payment, never funds.
 */
export async function listPaymentWebhookReceiptsForAttempt(
  paymentAttemptId: string,
  limit = 10
): Promise<AdminPaymentWebhookReceiptRow[]> {
  const id = (paymentAttemptId ?? "").trim();
  if (!id || id.length > 64) return [];
  const take = Math.min(Math.max(limit, 1), PAYMENT_WEBHOOK_RECEIPTS_LIMIT);
  const rows = await prisma.paymentWebhookReceipt.findMany({
    where: { paymentAttemptId: id },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take,
    select: WEBHOOK_RECEIPT_SELECT,
  });
  return rows.map(mapWebhookReceiptRow);
}
