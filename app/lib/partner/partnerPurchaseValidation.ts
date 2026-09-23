/**
 * Pure validation helpers for Partner eSIM purchase payment mode (no DB I/O).
 * Mirrors customer mode strings; never accepts money fields.
 */

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type PartnerEsimPaymentMode =
  | "full_wallet"
  | "wallet_and_mobile"
  | "mobile_only";

/** Checkbox / hidden boolean — never accepts money amounts. */
export function parsePartnerUseWalletChoice(raw: unknown): boolean {
  if (raw === true || raw === "true" || raw === "on" || raw === "1") return true;
  return false;
}

/**
 * Explicit partner payment mode → useWallet for funding calculation.
 * Never accepts money fields.
 */
export function parsePartnerEsimPaymentMode(
  raw: unknown
): ParseResult<PartnerEsimPaymentMode> {
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

/** Map payment mode to the useWallet funding flag. */
export function useWalletFromPartnerPaymentMode(
  mode: PartnerEsimPaymentMode
): boolean {
  return mode === "full_wallet" || mode === "wallet_and_mobile";
}

/**
 * Prefer explicit paymentMode; fall back to useWallet checkbox.
 * When neither is sent (legacy Partner UI), default useWallet true so
 * wallet-first behavior stays unchanged until Phase B mode UI ships.
 * Never trusts browser money fields.
 */
export function resolvePartnerCheckoutUseWallet(formData: FormData): {
  useWallet: boolean;
  paymentMode: PartnerEsimPaymentMode | null;
  error?: string;
} {
  const modeRaw = formData.get("paymentMode");
  if (modeRaw != null && String(modeRaw).trim() !== "") {
    const parsed = parsePartnerEsimPaymentMode(modeRaw);
    if (!parsed.ok) {
      return { useWallet: false, paymentMode: null, error: parsed.error };
    }
    return {
      useWallet: useWalletFromPartnerPaymentMode(parsed.value),
      paymentMode: parsed.value,
    };
  }
  if (formData.has("useWallet")) {
    return {
      useWallet: parsePartnerUseWalletChoice(formData.get("useWallet")),
      paymentMode: null,
    };
  }
  return { useWallet: true, paymentMode: null };
}
