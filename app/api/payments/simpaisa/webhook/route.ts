import { NextResponse } from "next/server";
import { applyVerifiedPaymentEvent } from "@/app/lib/payments/applyVerifiedPaymentEvent";
import { observeSimpaisaWebhookDelivery } from "@/app/lib/payments/paymentWebhookReceipt";
import {
  resolveSimpaisaInquiryConfig,
  resolveSimpaisaWebhookConfig,
} from "@/app/lib/payments/simpaisaConfig";
import {
  SimpaisaHttpClient,
  SimpaisaHttpError,
} from "@/app/lib/payments/simpaisaHttp";
import { validateSimpaisaAuthoritativeInquiry } from "@/app/lib/payments/simpaisaInquiryValidate";
import {
  isSimpaisaSandboxUnsignedWebhookAllowed,
  isSimpaisaWebhookPostbackAcceptable,
  isSimpaisaWebhookSignatureContractAvailable,
} from "@/app/lib/payments/simpaisaPolicy";
import {
  classifySimpaisaWebhookApplyFailure,
  classifySimpaisaWebhookParseIgnore,
  peekSimpaisaWebhookLogFields,
  simpaisaSignatureHeader,
} from "@/app/lib/payments/simpaisaWebhookObservability";
import {
  parseSimpaisaWebhookEvent,
  peekSimpaisaWebhookResponseCode,
} from "@/app/lib/payments/simpaisaWebhookParse";
import { verifySimpaisaWebhookSignature } from "@/app/lib/payments/simpaisaWebhookCrypto";
import type { NormalizedPaymentEvent } from "@/app/lib/payments/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Simpaisa PK wallet payin postback.
 *
 * Intended callback URL (share with Simpaisa only when ready):
 * https://mapesim.com/api/payments/simpaisa/webhook
 *
 * Sandbox (SIMPAISA_ENVIRONMENT=sandbox):
 * - Unsigned postbacks are accepted as Inquire triggers only.
 * - Never fund on webhook payload alone — authoritative Inquire 0000 required.
 *
 * Production:
 * - Fail-closed until Simpaisa provides/approves signature contract.
 * - allowProduction remains false; PAYMENT_GATEWAY_ENABLED must stay off in Production.
 *
 * Browser return is never authoritative.
 * Never logs raw body, secrets, MSISDN, or card data.
 */
export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    await observeSimpaisaWebhookDelivery({
      code: "BODY_REJECTED",
      httpStatus: 400,
      httpOutcome: "rejected",
      errorCategory: "READ_FAILED",
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!rawBody) {
    await observeSimpaisaWebhookDelivery({
      code: "BODY_REJECTED",
      httpStatus: 400,
      httpOutcome: "rejected",
      errorCategory: "EMPTY_BODY",
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (rawBody.length > 256_000) {
    await observeSimpaisaWebhookDelivery({
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

  const peek = peekSimpaisaWebhookLogFields(rawBody, headers);

  const inquiryConfig = resolveSimpaisaInquiryConfig();
  if (!inquiryConfig.ok) {
    await observeSimpaisaWebhookDelivery({
      code: "CONFIG_MISSING",
      httpStatus: 503,
      httpOutcome: "rejected",
      errorCategory: inquiryConfig.code,
      eventId: peek.eventId,
      tracker: peek.tracker,
      eventType: peek.eventType,
    });
    return NextResponse.json({ ok: false, outcome: "config_missing" }, { status: 503 });
  }

  const { environment } = inquiryConfig.config;
  const sandboxUnsigned = isSimpaisaSandboxUnsignedWebhookAllowed(environment);

  if (!isSimpaisaWebhookPostbackAcceptable({ environment })) {
    await observeSimpaisaWebhookDelivery({
      code: "SIGNATURE_REJECTED",
      httpStatus: 503,
      httpOutcome: "rejected",
      errorCategory: "SIGNATURE_CONTRACT_UNAVAILABLE",
      eventId: peek.eventId,
      tracker: peek.tracker,
      eventType: peek.eventType,
    });
    return NextResponse.json(
      { ok: false, outcome: "signature_contract_unavailable" },
      { status: 503 }
    );
  }

  if (!sandboxUnsigned) {
    const webhookConfig = resolveSimpaisaWebhookConfig();
    if (!webhookConfig.ok) {
      await observeSimpaisaWebhookDelivery({
        code: "CONFIG_MISSING",
        httpStatus: 503,
        httpOutcome: "rejected",
        errorCategory: webhookConfig.code,
        eventId: peek.eventId,
        tracker: peek.tracker,
        eventType: peek.eventType,
      });
      return NextResponse.json(
        { ok: false, outcome: "webhook_secret_missing" },
        { status: 503 }
      );
    }

    if (!isSimpaisaWebhookSignatureContractAvailable()) {
      await observeSimpaisaWebhookDelivery({
        code: "SIGNATURE_REJECTED",
        httpStatus: 503,
        httpOutcome: "rejected",
        errorCategory: "SIGNATURE_CONTRACT_UNAVAILABLE",
        eventId: peek.eventId,
        tracker: peek.tracker,
        eventType: peek.eventType,
      });
      return NextResponse.json(
        { ok: false, outcome: "signature_contract_unavailable" },
        { status: 503 }
      );
    }

    const productionSignatureOk = verifySimpaisaWebhookSignature({
      rawBody,
      signatureHeader: simpaisaSignatureHeader(headers),
      webhookSecret: webhookConfig.config.webhookSecret,
    });
    if (!productionSignatureOk) {
      await observeSimpaisaWebhookDelivery({
        code: "SIGNATURE_REJECTED",
        httpStatus: 503,
        httpOutcome: "rejected",
        errorCategory: "INVALID_SIGNATURE",
        eventId: peek.eventId,
        tracker: peek.tracker,
        eventType: peek.eventType,
      });
      return NextResponse.json(
        { ok: false, outcome: "signature_rejected" },
        { status: 503 }
      );
    }
  }

  const event = parseSimpaisaWebhookEvent({
    rawBody,
    headers,
    expectedConfig: inquiryConfig.config,
    signatureVerified: false,
  });
  if (!event) {
    await observeSimpaisaWebhookDelivery({
      code: "PARSE_IGNORED",
      httpStatus: 200,
      httpOutcome: "ignored",
      errorCategory: classifySimpaisaWebhookParseIgnore(rawBody, headers),
      eventId: peek.eventId,
      tracker: peek.tracker,
      eventType: peek.eventType,
    });
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (
    event.paymentStatus === "pending" ||
    event.paymentStatus === "uncertain" ||
    event.paymentStatus === "failed"
  ) {
    const outcome =
      event.paymentStatus === "pending"
        ? "pending_not_paid"
        : event.paymentStatus === "uncertain"
          ? "uncertain_not_paid"
          : "failed_not_paid";
    await observeSimpaisaWebhookDelivery({
      code: "APPLY_RESULT",
      httpStatus: 200,
      httpOutcome: "ignored",
      errorCategory:
        event.paymentStatus === "pending"
          ? "PENDING_NOT_PAID"
          : event.paymentStatus === "uncertain"
            ? "UNCERTAIN_NOT_PAID"
            : "FAILED_NOT_PAID",
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: peekSimpaisaWebhookResponseCode(rawBody),
      kind: "ignored",
      outcome,
      duplicate: false,
      paymentAttemptId: event.paymentAttemptId,
      topupId: event.localTopupId,
    });
    return NextResponse.json({ ok: true, ignored: true, outcome }, { status: 200 });
  }

  if (event.paymentStatus !== "confirmed") {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const inquiryClient = new SimpaisaHttpClient(inquiryConfig.config);
  let inquiryResult;
  try {
    inquiryResult = await inquiryClient.inquireTransaction({
      userKey: event.paymentAttemptId,
      transactionId: event.providerPaymentRef,
      operatorId: event.walletOperatorId,
    });
  } catch (error) {
    const inquiryErrorCode =
      error instanceof SimpaisaHttpError ? error.code : "UNKNOWN";
    console.error("simpaisa_webhook", "INQUIRY_UNAVAILABLE", inquiryErrorCode);
    await observeSimpaisaWebhookDelivery({
      code: "APPLY_FAILED",
      httpStatus: 500,
      httpOutcome: "failed",
      errorCategory: "INQUIRY_UNAVAILABLE",
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: peek.eventType,
      paymentAttemptId: event.paymentAttemptId,
      topupId: event.localTopupId,
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (inquiryResult.status === "pending" || inquiryResult.status === "uncertain") {
    const outcome =
      inquiryResult.status === "pending" ? "inquiry_pending" : "inquiry_uncertain";
    await observeSimpaisaWebhookDelivery({
      code: "APPLY_RESULT",
      httpStatus: 200,
      httpOutcome: "ignored",
      errorCategory:
        inquiryResult.status === "pending" ? "INQUIRY_PENDING" : "INQUIRY_UNCERTAIN",
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: peek.eventType,
      kind: "ignored",
      outcome,
      duplicate: false,
      paymentAttemptId: event.paymentAttemptId,
      topupId: event.localTopupId,
    });
    return NextResponse.json({ ok: true, ignored: true, outcome }, { status: 200 });
  }

  if (inquiryResult.status === "failed") {
    const failedEvent: NormalizedPaymentEvent = {
      ...event,
      signatureVerified: true,
      paymentStatus: "failed",
      confirmedAt: null,
      failureCategory: event.failureCategory || "inquiry_failed",
    };
    return applySimpaisaWebhookEvent(failedEvent, peek.eventType);
  }

  const validation = validateSimpaisaAuthoritativeInquiry({
    inquiry: inquiryResult,
    expected: {
      merchantId: inquiryConfig.config.merchantId,
      operatorId: event.walletOperatorId ?? inquiryResult.operatorId ?? "",
      userKey: event.paymentAttemptId ?? "",
      transactionId: event.providerPaymentRef,
      chargeAmountMinor: event.chargeAmountMinor,
      chargeCurrency: event.chargeCurrency,
    },
  });
  if (!validation.ok) {
    await observeSimpaisaWebhookDelivery({
      code: "APPLY_RESULT",
      httpStatus: 200,
      httpOutcome: "ignored",
      errorCategory: validation.reason,
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: peek.eventType,
      kind: "ignored",
      outcome: "inquiry_field_mismatch",
      duplicate: false,
      paymentAttemptId: event.paymentAttemptId,
      topupId: event.localTopupId,
    });
    return NextResponse.json(
      { ok: true, ignored: true, outcome: "inquiry_field_mismatch" },
      { status: 200 }
    );
  }

  const fundedEvent: NormalizedPaymentEvent = {
    ...event,
    signatureVerified: true,
    paymentStatus: "confirmed",
    confirmedAt: new Date(),
  };
  return applySimpaisaWebhookEvent(fundedEvent, peek.eventType);
}

async function applySimpaisaWebhookEvent(
  event: NormalizedPaymentEvent,
  eventType: string | null | undefined
) {
  try {
    const result = await applyVerifiedPaymentEvent(event);
    const ignored = result.kind === "ignored";
    await observeSimpaisaWebhookDelivery({
      code: "APPLY_RESULT",
      httpStatus: 200,
      httpOutcome: ignored ? "ignored" : "applied",
      errorCategory: ignored ? result.reason : null,
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: eventType ?? null,
      kind: result.kind,
      outcome: ignored ? result.reason : result.outcome,
      duplicate: ignored ? false : result.duplicate,
      paymentAttemptId:
        result.kind === "esim_purchase" || ignored ? event.paymentAttemptId : null,
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
    await observeSimpaisaWebhookDelivery({
      code: "APPLY_FAILED",
      httpStatus: 500,
      httpOutcome: "failed",
      errorCategory: classifySimpaisaWebhookApplyFailure(error),
      eventId: event.eventId,
      tracker: event.providerPaymentRef,
      eventType: eventType ?? null,
      paymentAttemptId: event.paymentAttemptId,
      topupId: event.localTopupId,
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
