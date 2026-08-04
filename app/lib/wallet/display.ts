/**
 * Pure wallet display helpers (safe for QA imports; no DB I/O).
 * Money is always integer USD cents — never floating-point arithmetic.
 */

export const WALLET_TRANSACTIONS_PAGE_SIZE = 20;

export type WalletTransactionTypeLabel =
  | "Admin credit"
  | "Top-up"
  | "Purchase"
  | "Refund"
  | "Adjustment credit"
  | "Adjustment debit"
  | "Reversal"
  | "Transaction";

export type WalletDirectionLabel = "Credit" | "Debit";

export type WalletStatusLabel =
  | "Pending"
  | "Completed"
  | "Failed"
  | "Reversed"
  | "Unknown";

/**
 * Format integer USD cents as a currency string.
 * Invalid / non-integer inputs fail safely to "$0.00".
 * Negative values are allowed for transaction presentation only.
 */
export function formatUsdCents(cents: unknown): string {
  if (typeof cents !== "number" || !Number.isInteger(cents) || !Number.isSafeInteger(cents)) {
    return "$0.00";
  }

  const negative = cents < 0;
  const abs = cents < 0 ? -cents : cents;
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const body = `$${dollars}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

export function parseWalletTransactionsPage(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null || raw === "") return 1;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return n;
}

export function clampWalletTransactionsPage(
  page: number,
  totalCount: number,
  pageSize = WALLET_TRANSACTIONS_PAGE_SIZE
): { page: number; totalPages: number } {
  const safeSize = pageSize > 0 ? pageSize : WALLET_TRANSACTIONS_PAGE_SIZE;
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / safeSize);
  let safePage = parseWalletTransactionsPage(page);
  if (safePage > totalPages) safePage = totalPages;
  return { page: safePage, totalPages };
}

export function walletTransactionTypeLabel(type: string): WalletTransactionTypeLabel {
  switch (type) {
    case "ADMIN_CREDIT":
      return "Admin credit";
    case "TOPUP_CREDIT":
      return "Top-up";
    case "PURCHASE_DEBIT":
      return "Purchase";
    case "REFUND_CREDIT":
      return "Refund";
    case "ADJUSTMENT_CREDIT":
      return "Adjustment credit";
    case "ADJUSTMENT_DEBIT":
      return "Adjustment debit";
    case "REVERSAL":
      return "Reversal";
    default:
      return "Transaction";
  }
}

export function walletDirectionLabel(direction: string): WalletDirectionLabel {
  return direction === "DEBIT" ? "Debit" : "Credit";
}

export function walletStatusLabel(status: string): WalletStatusLabel {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "REVERSED":
      return "Reversed";
    default:
      return "Unknown";
  }
}

/** Safe, truncated reference for UI — never dumps raw provider payloads. */
export function formatWalletReference(
  referenceType: string | null | undefined,
  referenceId: string | null | undefined
): string | null {
  const type = (referenceType ?? "").trim();
  const id = (referenceId ?? "").trim();
  if (!type && !id) return null;
  if (!id) return type || null;
  const suffix = id.length > 8 ? id.slice(-8) : id;
  if (!type) return `…${suffix}`;
  return `${type} · …${suffix}`;
}

export function formatWalletTransactionAmount(
  amountCents: number,
  direction: string
): string {
  if (direction === "DEBIT") {
    return formatUsdCents(-Math.abs(amountCents));
  }
  const body = formatUsdCents(Math.abs(amountCents));
  if (body === "$0.00") return body;
  return `+${body}`;
}

export function formatWalletDateTime(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}
