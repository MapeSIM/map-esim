/**
 * Fail-open PaymentWebhookReceipt writer.
 * Observability only — never applies payment, never stores raw body/signatures/secrets.
 */
import "server-only";

import { PaymentGatewayProvider } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  clipWebhookToken,
  formatSafepayWebhookLog,
  logSafepayWebhook,
  webhookReceiptVerifyFlags,
  type SafepayWebhookLogInput,
} from "@/app/lib/payments/safepayWebhookObservability";
import {
  formatSimpaisaWebhookLog,
  logSimpaisaWebhook,
  simpaisaWebhookReceiptVerifyFlags,
  type SimpaisaWebhookLogInput,
} from "@/app/lib/payments/simpaisaWebhookObservability";

export type PaymentWebhookReceiptInput = SafepayWebhookLogInput & {
  paymentAttemptId?: string | null;
  topupId?: string | null;
  provider?: PaymentGatewayProvider;
};

export type SimpaisaPaymentWebhookReceiptInput = SimpaisaWebhookLogInput & {
  paymentAttemptId?: string | null;
  topupId?: string | null;
};

export async function recordPaymentWebhookReceipt(
  input: PaymentWebhookReceiptInput
): Promise<void> {
  const formatted = formatSafepayWebhookLog(input);
  const flags = webhookReceiptVerifyFlags(formatted.code);
  const httpStatus =
    Number.isInteger(input.httpStatus) &&
    input.httpStatus >= 100 &&
    input.httpStatus <= 599
      ? input.httpStatus
      : formatted.payload.httpStatus;
  const provider = input.provider ?? PaymentGatewayProvider.SAFEPAY;

  try {
    await prisma.paymentWebhookReceipt.create({
      data: {
        provider,
        eventId: formatted.payload.eventId,
        eventType: formatted.payload.eventType,
        signatureOk: flags.signatureOk,
        parseOk: flags.parseOk,
        httpStatus,
        logCode: formatted.code,
        errorCategory: formatted.payload.errorCategory,
        applyOutcome: formatted.payload.outcome,
        paymentAttemptId: clipWebhookToken(input.paymentAttemptId, 64),
        topupId: clipWebhookToken(input.topupId, 64),
        trackerMasked: formatted.payload.trackerMasked,
      },
    });
  } catch {
    console.error("safepay_webhook", "RECEIPT_WRITE_FAILED", {
      logCode: formatted.code,
      httpStatus,
      eventId: formatted.payload.eventId,
    });
  }
}

export async function observeSafepayWebhookDelivery(
  input: PaymentWebhookReceiptInput
): Promise<void> {
  logSafepayWebhook(input);
  await recordPaymentWebhookReceipt({
    ...input,
    provider: input.provider ?? PaymentGatewayProvider.SAFEPAY,
  });
}

export async function observeSimpaisaWebhookDelivery(
  input: SimpaisaPaymentWebhookReceiptInput
): Promise<void> {
  logSimpaisaWebhook(input);
  const formatted = formatSimpaisaWebhookLog(input);
  const flags = simpaisaWebhookReceiptVerifyFlags(formatted.code);
  const httpStatus =
    Number.isInteger(input.httpStatus) &&
    input.httpStatus >= 100 &&
    input.httpStatus <= 599
      ? input.httpStatus
      : formatted.payload.httpStatus;

  try {
    await prisma.paymentWebhookReceipt.create({
      data: {
        provider: PaymentGatewayProvider.SIMPAISA,
        eventId: formatted.payload.eventId,
        eventType: formatted.payload.eventType,
        signatureOk: flags.signatureOk,
        parseOk: flags.parseOk,
        httpStatus,
        logCode: formatted.code,
        errorCategory: formatted.payload.errorCategory,
        applyOutcome: formatted.payload.outcome,
        paymentAttemptId: clipWebhookToken(input.paymentAttemptId, 64),
        topupId: clipWebhookToken(input.topupId, 64),
        trackerMasked: formatted.payload.trackerMasked,
      },
    });
  } catch {
    console.error("simpaisa_webhook", "RECEIPT_WRITE_FAILED", {
      logCode: formatted.code,
      httpStatus,
      eventId: formatted.payload.eventId,
    });
  }
}
