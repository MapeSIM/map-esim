/**
 * Pure validation helpers for ADMIN-assisted customer-wallet eSIM purchase.
 */

export const ASSISTED_WALLET_REASON_MIN = 5;
export const ASSISTED_WALLET_REASON_MAX = 200;
export const ASSISTED_WALLET_CONFIRM_PHRASE = "PURCHASE";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Sanitize and validate mandatory assisted-purchase reason. */
export function parseAssistedWalletPurchaseReason(
  raw: unknown
): ParseResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "A reason is required." };
  }
  const reason = raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (reason.length < ASSISTED_WALLET_REASON_MIN) {
    return {
      ok: false,
      error: `Enter a reason of at least ${ASSISTED_WALLET_REASON_MIN} characters.`,
    };
  }
  if (reason.length > ASSISTED_WALLET_REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${ASSISTED_WALLET_REASON_MAX} characters.`,
    };
  }
  return { ok: true, value: reason };
}

export function parseAssistedWalletConfirmPhrase(
  raw: unknown
): ParseResult<true> {
  if (
    typeof raw !== "string" ||
    raw.trim() !== ASSISTED_WALLET_CONFIRM_PHRASE
  ) {
    return {
      ok: false,
      error: `Type ${ASSISTED_WALLET_CONFIRM_PHRASE} to confirm this wallet purchase.`,
    };
  }
  return { ok: true, value: true };
}

export function parseAssistedWalletIdempotencyKey(
  raw: unknown
): ParseResult<string> {
  if (typeof raw !== "string") {
    return {
      ok: false,
      error:
        "This purchase request could not be processed. Please reload and try again.",
    };
  }
  const key = raw.trim();
  if (
    !key ||
    key.length < 8 ||
    key.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(key)
  ) {
    return {
      ok: false,
      error:
        "This purchase request could not be processed. Please reload and try again.",
    };
  }
  return { ok: true, value: key };
}
