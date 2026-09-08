/**
 * Pure Admin Wallet Ledger helpers (offline-QA safe).
 * Display / lifecycle only — no Prisma, no balance writes.
 */

import {
  clampWalletTransactionsPage,
  parseWalletTransactionsPage,
  WALLET_TRANSACTIONS_PAGE_SIZE,
} from "@/app/lib/wallet/display";

export const ADMIN_WALLET_LEDGER_PAGE_SIZE = WALLET_TRANSACTIONS_PAGE_SIZE;
export const ADMIN_WALLET_LEDGER_PAGE_SIZE_MAX = 50;

export const WALLET_LEDGER_LIFECYCLE_LABELS = [
  "Reserved",
  "Captured",
  "Released",
  "Top-up",
  "Manual",
  "Refund credit",
] as const;

export type WalletLedgerLifecycleLabel =
  (typeof WALLET_LEDGER_LIFECYCLE_LABELS)[number];

/**
 * Derive ops lifecycle label from existing WalletTransaction type/status.
 * Mirrors reserve/capture/release semantics without new schema.
 */
export function walletLedgerLifecycleLabel(input: {
  type: string;
  status: string;
}): WalletLedgerLifecycleLabel {
  const type = String(input.type ?? "").trim().toUpperCase();
  const status = String(input.status ?? "").trim().toUpperCase();

  if (type === "TOPUP_CREDIT") return "Top-up";
  if (type === "REFUND_CREDIT") return "Refund credit";

  if (
    type === "ADMIN_CREDIT" ||
    type === "ADJUSTMENT_CREDIT" ||
    type === "ADJUSTMENT_DEBIT" ||
    type === "REVERSAL"
  ) {
    return "Manual";
  }

  if (type === "PURCHASE_DEBIT") {
    if (status === "PENDING") return "Reserved";
    if (status === "COMPLETED") return "Captured";
    if (status === "REVERSED") return "Released";
    return "Manual";
  }

  return "Manual";
}

export function parseAdminWalletLedgerPage(
  raw: string | null | undefined
): number {
  return parseWalletTransactionsPage(raw);
}

export function clampAdminWalletLedgerPage(
  page: number,
  totalCount: number,
  pageSize = ADMIN_WALLET_LEDGER_PAGE_SIZE
): { page: number; totalPages: number } {
  const size = Math.min(
    Math.max(pageSize, 1),
    ADMIN_WALLET_LEDGER_PAGE_SIZE_MAX
  );
  return clampWalletTransactionsPage(page, totalCount, size);
}

export function buildAdminWalletLedgerHref(input: {
  customerId: string;
  page?: number;
}): string {
  const id = String(input.customerId ?? "").trim();
  const base = `/admin/customers/${encodeURIComponent(id)}/wallet`;
  const page = input.page ?? 1;
  if (page > 1) return `${base}?page=${page}`;
  return base;
}
