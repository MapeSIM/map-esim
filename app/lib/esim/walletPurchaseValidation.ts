/**
 * Pure validation helpers for CUSTOMER wallet eSIM purchase (no DB I/O).
 */

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type CustomerEsimPaymentMode =
  | "full_wallet"
  | "wallet_and_mobile"
  | "mobile_only";

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

/**
 * Explicit customer payment mode → useWallet for existing funding calculation.
 * Never accepts money fields.
 */
export function parseCustomerEsimPaymentMode(
  raw: unknown
): ParseResult<CustomerEsimPaymentMode> {
  const value = String(raw ?? "").trim();
  if (
    value === "full_wallet" ||
    value === "wallet_and_mobile" ||
    value === "mobile_only"
  ) {
    return { ok: true, value };
  }
  return {
    ok: false,
    error: "Select how you want to pay for this eSIM.",
  };
}

/** Map payment mode to the existing useWallet funding flag. */
export function useWalletFromPaymentMode(
  mode: CustomerEsimPaymentMode
): boolean {
  return mode === "full_wallet" || mode === "wallet_and_mobile";
}

/**
 * Prefer explicit paymentMode; fall back to legacy useWallet checkbox for
 * older clients. Never trusts browser money fields.
 */
export function resolveCustomerCheckoutUseWallet(formData: FormData): {
  useWallet: boolean;
  paymentMode: CustomerEsimPaymentMode | null;
  error?: string;
} {
  const modeRaw = formData.get("paymentMode");
  if (modeRaw != null && String(modeRaw).trim() !== "") {
    const parsed = parseCustomerEsimPaymentMode(modeRaw);
    if (!parsed.ok) {
      return { useWallet: false, paymentMode: null, error: parsed.error };
    }
    return {
      useWallet: useWalletFromPaymentMode(parsed.value),
      paymentMode: parsed.value,
    };
  }
  return {
    useWallet: parseUseWalletChoice(formData.get("useWallet")),
    paymentMode: null,
  };
}
