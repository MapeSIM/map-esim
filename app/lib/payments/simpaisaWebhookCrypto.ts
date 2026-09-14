/**
 * Simpaisa webhook signature placeholder (pure — no I/O).
 *
 * Official PK wallet Pay-In callback samples do not include a signature field.
 * Do NOT invent or claim HMAC-SHA256 (or any other algorithm) as Simpaisa's.
 * Wallet postbacks are Inquire triggers only until an official wallet
 * signature contract is documented and implemented here.
 *
 * isSimpaisaWebhookSignatureContractAvailable() remains false.
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
