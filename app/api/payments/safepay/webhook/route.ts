import { NextResponse } from "next/server";
import { applyVerifiedPaymentEvent } from "@/app/lib/payments/applyVerifiedPaymentEvent";
import { resolveSafepayWebhookConfig } from "@/app/lib/payments/safepayConfig";
import {
  normalizeSafepayHeader,
  verifySafepayCardWebhookSignature,
} from "@/app/lib/payments/safepayWebhookCrypto";
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
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!rawBody || rawBody.length > 256_000) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const headers: Record<string, string | string[] | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const signature = normalizeSafepayHeader(
    headers["x-sfpy-signature"] ?? headers["X-SFPY-SIGNATURE"]
  );
  if (!signature) {
    console.error("safepay_webhook", "SIGNATURE_REJECTED", "MISSING");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const signatureOk = verifySafepayCardWebhookSignature({
    rawBody,
    signatureHeader: signature,
    webhookSecret: webhookConfig.config.webhookSecret,
  });
  if (!signatureOk) {
    console.error("safepay_webhook", "SIGNATURE_REJECTED", "INVALID");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const event = parseSafepayCardWebhookEvent({ rawBody, headers });
  if (!event) {
    // Unsupported/irrelevant event — acknowledge to stop retries.
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  try {
    const result = await applyVerifiedPaymentEvent(event);
    return NextResponse.json(
      {
        ok: true,
        kind: result.kind,
        duplicate: result.kind === "ignored" ? false : result.duplicate,
        outcome:
          result.kind === "ignored" ? result.reason : result.outcome,
      },
      { status: 200 }
    );
  } catch {
    console.error("safepay_webhook", "APPLY_FAILED");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
