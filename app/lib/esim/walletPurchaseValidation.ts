/**
 * Pure validation helpers for CUSTOMER wallet eSIM purchase (no DB I/O).
 */

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseWalletPurchaseIdempotencyKey(
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

/** Checkbox / hidden boolean — never accepts money amounts. */
export function parseUseWalletChoice(raw: unknown): boolean {
  if (raw === true || raw === "true" || raw === "on" || raw === "1") return true;
  return false;
}

/** Same parser as wallet — never accepts points or money amounts. */
export function parseUseRewardsChoice(raw: unknown): boolean {
  return parseUseWalletChoice(raw);
}
