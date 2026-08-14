/**
 * Read-only VeSIM provider wallet (documented endpoints only).
 * Never mutates balance. Never logs tokens or secrets.
 */
import "server-only";

import {
  getVesimBaseUrl,
  readJsonSafe,
  vesimAuthorizedFetch,
} from "@/app/lib/vesim/server";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";

export type ProviderWalletBalance = {
  balance: number | null;
  currency: string | null;
  discountPercent: number | null;
};

export type ProviderWalletTransaction = {
  type: string;
  amount: number | null;
  currency: string | null;
  description: string;
  createdAt: string | null;
  orderRefMasked: string | null;
};

export type ProviderWalletSnapshot = {
  balance: ProviderWalletBalance;
  transactions: ProviderWalletTransaction[];
  checkedAt: string;
};

export type ProviderWalletResult =
  | { ok: true; snapshot: ProviderWalletSnapshot }
  | {
      ok: false;
      code: "RATE_LIMITED" | "TEMPORARY_ERROR";
      retryAfterSec?: number;
    };

const WALLET_TIMEOUT_MS = 8_000;
const WALLET_RATE_WINDOW_MS = 30_000;
const MAX_TRANSACTIONS = 20;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function maskOrderRef(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length <= 8) return `${t.slice(0, 2)}…`;
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function sanitizeDescription(raw: string | null): string {
  if (!raw) return "—";
  // Strip long opaque ids / potential secrets from free text.
  const cleaned = raw
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[ref]")
    .replace(/\b\d{15,22}\b/g, "[id]")
    .trim();
  if (!cleaned) return "—";
  return cleaned.length > 160 ? `${cleaned.slice(0, 157)}…` : cleaned;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WALLET_TIMEOUT_MS);
  try {
    return await vesimAuthorizedFetch(url, {
      method: "GET",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseBalance(payload: JsonRecord): ProviderWalletBalance {
  const root =
    asRecord(payload.balance) ??
    asRecord(payload.data) ??
    asRecord(payload.wallet) ??
    payload;
  return {
    balance: asFiniteNumber(
      root.balance ?? root.availableBalance ?? root.amount ?? root.currentBalance
    ),
    currency: asTrimmedString(root.currency ?? root.currencyCode) || "USD",
    discountPercent: asFiniteNumber(
      root.discountPercent ?? root.discount_percent ?? root.discount
    ),
  };
}

function parseTransactions(payload: JsonRecord): ProviderWalletTransaction[] {
  const list =
    (Array.isArray(payload.transactions) && payload.transactions) ||
    (Array.isArray(payload.data) && payload.data) ||
    (Array.isArray(asRecord(payload.data)?.transactions) &&
      (asRecord(payload.data)!.transactions as unknown[])) ||
    [];

  const out: ProviderWalletTransaction[] = [];
  for (const item of list) {
    if (out.length >= MAX_TRANSACTIONS) break;
    const row = asRecord(item);
    if (!row) continue;
    const orderRef =
      asTrimmedString(row.orderId) ||
      asTrimmedString(row.order_id) ||
      asTrimmedString(row.providerOrderId) ||
      asTrimmedString(row.reference) ||
      null;
    out.push({
      type:
        asTrimmedString(row.type) ||
        asTrimmedString(row.transactionType) ||
        asTrimmedString(row.kind) ||
        "unknown",
      amount: asFiniteNumber(row.amount ?? row.value),
      currency: asTrimmedString(row.currency ?? row.currencyCode),
      description: sanitizeDescription(
        asTrimmedString(row.description) ||
          asTrimmedString(row.memo) ||
          asTrimmedString(row.note)
      ),
      createdAt:
        asTrimmedString(row.created_at) ||
        asTrimmedString(row.createdAt) ||
        asTrimmedString(row.timestamp) ||
        null,
      orderRefMasked: maskOrderRef(orderRef),
    });
  }
  return out;
}

/**
 * Explicit admin action: read provider wallet balance + recent transactions.
 */
export async function fetchProviderWalletSnapshot(): Promise<ProviderWalletResult> {
  const rate = consumeRateLimit({
    key: "admin-provider-wallet",
    limit: 1,
    windowMs: WALLET_RATE_WINDOW_MS,
  });
  if (!rate.ok) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      retryAfterSec: rate.retryAfterSec,
    };
  }

  try {
    const baseUrl = getVesimBaseUrl();
    const [balanceRes, txRes] = await Promise.all([
      fetchWithTimeout(`${baseUrl}/api/wallet/balance`),
      fetchWithTimeout(`${baseUrl}/api/wallet/transactions`),
    ]);

    if (!balanceRes.ok) {
      return { ok: false, code: "TEMPORARY_ERROR" };
    }

    const balancePayload = (await readJsonSafe(balanceRes)) as JsonRecord;
    const txPayload = txRes.ok
      ? ((await readJsonSafe(txRes)) as JsonRecord)
      : {};

    return {
      ok: true,
      snapshot: {
        balance: parseBalance(balancePayload),
        transactions: parseTransactions(txPayload),
        checkedAt: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, code: "TEMPORARY_ERROR" };
  }
}

export function providerWalletPublicError(
  code: "RATE_LIMITED" | "TEMPORARY_ERROR"
): { status: number; message: string } {
  if (code === "RATE_LIMITED") {
    return {
      status: 429,
      message:
        "Please wait a moment before refreshing the provider wallet again.",
    };
  }
  return {
    status: 503,
    message: "Provider wallet is temporarily unavailable. Please try again later.",
  };
}
