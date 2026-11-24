/**
 * Client helpers for sandbox catalog purchases and wallet sync.
 * Never invents API keys — uses the session-provisioned sb_test_ key only.
 */

import { SANDBOX_CATALOG } from "@/app/lib/sandbox/sandboxShared";
import {
  SANDBOX_API_KEY_KEY,
  SANDBOX_ORDERS_KEY,
  SANDBOX_TX_KEY,
  SANDBOX_WALLET_KEY,
  type SandboxStoredOrder,
  type SandboxWalletTx,
} from "@/app/lib/sandbox/sandboxClientStorage";

export function readSandboxApiKey(): string | null {
  try {
    const key = localStorage.getItem(SANDBOX_API_KEY_KEY);
    return key?.startsWith("sb_test_") ? key : null;
  } catch {
    return null;
  }
}

/** Map a listed retail plan price onto the closest sandbox catalog SKU. */
export function pickSandboxSku(priceCents: number): string {
  const sorted = [...SANDBOX_CATALOG].sort(
    (a, b) =>
      Math.abs(a.priceCents - priceCents) - Math.abs(b.priceCents - priceCents)
  );
  return sorted[0]?.id ?? SANDBOX_CATALOG[0]!.id;
}

export async function refreshSandboxWalletCache(): Promise<number | null> {
  const key = readSandboxApiKey();
  if (!key) return null;
  try {
    const res = await fetch("/api/sandbox/v1/wallet", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      wallet?: { balanceCents?: number };
      transactions?: SandboxWalletTx[];
    };
    const cents = data.wallet?.balanceCents;
    if (typeof cents === "number" && Number.isFinite(cents)) {
      try {
        localStorage.setItem(SANDBOX_WALLET_KEY, String(cents));
      } catch {
        /* ignore */
      }
    }
    if (Array.isArray(data.transactions)) {
      try {
        localStorage.setItem(SANDBOX_TX_KEY, JSON.stringify(data.transactions));
      } catch {
        /* ignore */
      }
    }
    return typeof cents === "number" ? cents : null;
  } catch {
    return null;
  }
}

export function rememberSandboxOrder(order: SandboxStoredOrder): void {
  try {
    const prev = JSON.parse(
      localStorage.getItem(SANDBOX_ORDERS_KEY) || "[]"
    ) as SandboxStoredOrder[];
    const list = Array.isArray(prev) ? prev : [];
    const next = [order, ...list.filter((o) => o.orderId !== order.orderId)].slice(
      0,
      40
    );
    localStorage.setItem(SANDBOX_ORDERS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function loadCachedSandboxOrders(): SandboxStoredOrder[] {
  try {
    const raw = localStorage.getItem(SANDBOX_ORDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as SandboxStoredOrder[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function findCachedSandboxOrder(
  orderId: string
): SandboxStoredOrder | null {
  const id = orderId.trim();
  if (!id) return null;
  return loadCachedSandboxOrders().find((o) => o.orderId === id) ?? null;
}
