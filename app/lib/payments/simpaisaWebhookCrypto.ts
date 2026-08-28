/**
 * Simpaisa webhook signature placeholder (pure — no I/O).
 *
 * Official docs require postback signature verification, but the merchant-
 * specific signing algorithm and secret have NOT been provided yet.
 * Do NOT invent or claim HMAC-SHA256 (or any other algorithm) as Simpaisa's.
 *
 * isSimpaisaWebhookSignatureContractAvailable() remains false until the
 * official algorithm is implemented from merchant docs.
 */
import { isSimpaisaWebhookSignatureContractAvailable } from "@/app/lib/payments/simpaisaPolicy";

export { isSimpaisaWebhookSignatureContractAvailable };

export function normalizeSimpaisaHeader(
  value: string | string[] | undefined | null
): string {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

/**
 * Placeholder signature check — always fails until the official contract exists.
 * Never invents an algorithm. Never returns true while the contract is unavailable.
 */
export function verifySimpaisaWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string;
  webhookSecret: string;
}): boolean {
  void input;
  if (!isSimpaisaWebhookSignatureContractAvailable()) {
    return false;
  }
  // Official algorithm not implemented — fail closed.
  return false;
}
