import { NextResponse } from "next/server";
import { applyVerifiedPaymentEvent } from "@/app/lib/payments/applyVerifiedPaymentEvent";
import { observeSafepayWebhookDelivery } from "@/app/lib/payments/paymentWebhookReceipt";
import { resolveSafepayWebhookConfig } from "@/app/lib/payments/safepayConfig";
import {
  normalizeSafepayHeader,
  verifySafepayCardWebhookSignature,
} from "@/app/lib/payments/safepayWebhookCrypto";
import {
  classifySafepayWebhookApplyFailure,
  classifySafepayWebhookParseIgnore,
  peekSafepayWebhookLogFields,
} from "@/app/lib/payments/safepayWebhookObservability";
import { parseSafepayCardWebhookEvent } from "@/app/lib/payments/safepayWebhookParse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Safepay Card Payments webhook.
 * Uses SAFEPAY_WEBHOOK_SECRET independently of PAYMENT_GATEWAY_ENABLED.
 * Signature must verify before any mutation. Browser return is never authoritative.
 * Dispatches to eSIM purchase or wallet top-up funding (never VeSIM from top-up).
 * Never logs raw body, secrets, or card data.
 */
export async function POST(request: Request) {
  const webhookConfig = resolveSafepayWebhookConfig();
  if (!webhookConfig.ok) {
    await observeSafepayWebhookDelivery({
      code: "CONFIG_MISSING",
      httpStatus: 503,
      httpOutcome: "rejected",
      errorCategory: webhookConfig.code,
    });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    await observeSafepayWebhookDelivery({
      code: "BODY_REJECTED",
      httpStatus: 400,
      httpOutcome: "rejected",
      errorCategory: "READ_FAILED",
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!rawBody) {
    await observeSafepayWebhookDelivery({
      code: "BODY_REJECTED",
      httpStatus: 400,
      httpOutcome: "rejected",
      errorCategory: "EMPTY_BODY",
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (rawBody.length > 256_000) {
    await observeSafepayWebhookDelivery({
      code: "BODY_REJECTED",
      httpStatus: 400,
      httpOutcome: "rejected",
      errorCategory: "OVERSIZED_BODY",
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const headers: Record<string, string | string[] | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const peek = peekSafepayWebhookLogFields(rawBody, headers);

  const signature = normalizeSafepayHeader(
    headers["x-sfpy-signature"] ?? headers["X-SFPY-SIGNATURE"]
  );
  if (!signature) {
    await observeSafepayWebhookDelivery({
      code: "SIGNATURE_REJECTED",
      httpStatus: 401,
      httpOutcome: "rejected",
      errorCategory: "MISSING",
      eventId: peek.eventId,
      tracker: peek.tracker,
      eventType: peek.eventType,
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const signatureOk = verifySafepayCardWebhookSignature({
    rawBody,
    signatureHeader: signature,
    webhookSecret: webhookConfig.config.webhookSecret,
  });
  if (!signatureOk) {
    await observeSafepayWebhookDelivery({
      code: "SIGNATURE_REJECTED",
      httpStatus: 401,
      httpOutcome: "rejected",
      errorCategory: "INVALID",
      eventId: peek.eventId,
      tracker: peek.tracker,
      eventType: peek.eventType,
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const event = parseSafepayCardWebhookEvent({ rawBody, headers });
  if (!event) {
    await observeSafepayWebhookDelivery({
      code: "PARSE_IGNORED",
      httpStatus: 200,
      httpOutcome: "ignored",
      errorCategory: classifySafepayWebhookParseIgnore(rawBody, headers),
      eventId: peek.eventId,
      tracker: peek.tracker,
      eventType: peek.eventType,
    });
    // Unsupported/irrelevant event — acknowledge to stop retries.
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  try {
    const result = await applyVerifiedPaymentEvent(event);
    const ignored = result.kind === "ignored";
    await observeSafepayWebhookDelivery({
      code: "APPLY_RESULT",
      httpStatus: 200,
      httpOutcome: ignored ? "ignored" : "applied",
      errorCategory: ignored ? result.reason : null,
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: peek.eventType,
      kind: result.kind,
      outcome: ignored ? result.reason : result.outcome,
      duplicate: ignored ? false : result.duplicate,
      paymentAttemptId:
        result.kind === "esim_purchase" || ignored
          ? event.paymentAttemptId
          : null,
      topupId:
        result.kind === "wallet_topup"
          ? event.localTopupId ?? event.paymentAttemptId
          : null,
    });
    return NextResponse.json(
      {
        ok: true,
        kind: result.kind,
        duplicate: ignored ? false : result.duplicate,
        outcome: ignored ? result.reason : result.outcome,
      },
      { status: 200 }
    );
  } catch (error) {
    await observeSafepayWebhookDelivery({
      code: "APPLY_FAILED",
      httpStatus: 500,
      httpOutcome: "failed",
      errorCategory: classifySafepayWebhookApplyFailure(error),
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: peek.eventType,
      paymentAttemptId: event.paymentAttemptId,
      topupId: event.localTopupId,
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
