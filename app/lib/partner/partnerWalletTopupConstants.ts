/**
 * Partner wallet Add Funds constants — merchant key namespace + audit labels.
 * Distinct from customer WalletTopup ids (never collide with cuid topup/attempt ids).
 */
export const PARTNER_TOPUP_USER_KEY_PREFIX = "ptop_" as const;

export const PARTNER_TOPUP_CREDIT_REFERENCE_TYPE = "PARTNER_WALLET_TOPUP";

export const PARTNER_TOPUP_MIN_CENTS = 10; // $0.10
export const PARTNER_TOPUP_MAX_CENTS = 50_000; // $500.00

export const PARTNER_TOPUP_DRAFT_CREATED = "partner.wallet_topup_draft_created";
export const PARTNER_TOPUP_CHECKOUT_CREATED =
  "partner.wallet_topup_checkout_created";
export const PARTNER_TOPUP_PAYMENT_PENDING =
  "partner.wallet_topup_payment_pending";
export const PARTNER_TOPUP_PAYMENT_CONFIRMED =
  "partner.wallet_topup_payment_confirmed";
export const PARTNER_TOPUP_CREDITED = "partner.wallet_topup_credited";
export const PARTNER_TOPUP_FAILED = "partner.wallet_topup_failed";
export const PARTNER_TOPUP_RECONCILIATION =
  "partner.wallet_topup_reconciliation";
export const PARTNER_TOPUP_WEBHOOK_DUPLICATE =
  "partner.wallet_topup_webhook_duplicate";

export function partnerTopupMerchantUserKey(topupId: string): string {
  return `${PARTNER_TOPUP_USER_KEY_PREFIX}${topupId.trim()}`;
}

export function parsePartnerTopupIdFromMerchantUserKey(
  raw: string | null | undefined
): string | null {
  const key = (raw ?? "").trim();
  if (!key.startsWith(PARTNER_TOPUP_USER_KEY_PREFIX)) return null;
  const id = key.slice(PARTNER_TOPUP_USER_KEY_PREFIX.length).trim();
  if (!id || id.length > 64) return null;
  return id;
}

export function partnerTopupCreditIdempotencyKey(topupId: string): string {
  return `partner_topup_credit_${topupId.trim()}`;
}

/** Browser return / refresh must never credit Partner wallet. */
export function browserReturnMustNotCreditPartnerWallet(): void {
  // Marker for QA + call sites — funding only via verified Inquire webhook path.
}

/** Preview/dev-only diagnostics — never enable on Production. */
export function isPartnerTopupDiagEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview"
  );
}

/**
 * Safe Partner top-up failure log for Preview/dev.
 * Never logs secrets, DATABASE_URL, passwords, API keys, or full MSISDN.
 */
export function logPartnerTopupFailure(input: {
  step: string;
  error: unknown;
}): void {
  if (!isPartnerTopupDiagEnabled()) return;
  const err = input.error;
  const errorClass =
    err instanceof Error
      ? err.name || "Error"
      : err === null
        ? "null"
        : typeof err;
  let errorCode: string | null = null;
  let errorMessage = "";
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.length <= 32) errorCode = code;
  }
  if (err instanceof Error) {
    errorMessage = err.message;
  } else if (typeof err === "string") {
    errorMessage = err;
  } else {
    errorMessage = "non_error";
  }
  // Strip long digit runs (possible MSISDN) and truncate.
  errorMessage = errorMessage
    .replace(/\d{8,}/g, "[digits]")
    .replace(/(postgres(ql)?:\/\/)[^\s]+/gi, "$1[redacted]")
    .slice(0, 280);
  console.error("partner_wallet_topup_failure", {
    step: input.step.slice(0, 64),
    errorClass: String(errorClass).slice(0, 64),
    errorCode,
    errorMessage,
  });
}
