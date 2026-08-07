/**
 * Safepay Card Payments webhook signature helpers (pure — no I/O).
 * Official Card / Express Checkout SDK scheme: HMAC-SHA512 over raw body.
 * Header: X-SFPY-SIGNATURE (hex digest).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function normalizeSafepayHeader(
  value: string | string[] | undefined | null
): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

/**
 * Verify Safepay Card Payments webhook signature.
 * Uses raw body bytes exactly as received — never re-serialize JSON first.
 */
export function verifySafepayCardWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string;
  webhookSecret: string;
}): boolean {
  const secret = input.webhookSecret;
  const signature = input.signatureHeader.trim();
  const rawBody = input.rawBody;
  if (!secret || !signature || typeof rawBody !== "string") return false;

  const expected = createHmac("sha512", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
