import "server-only";

import { randomBytes } from "node:crypto";
import { OrderStatus, Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { isProviderUsageExpired } from "@/app/lib/esim/esimLifecycleNotificationShared";
import { resolveCustomerEsimStatusBadge } from "@/app/lib/orders/customerOrderDisplay";
import {
  fetchProviderUsage,
  normalizeProviderUsagePayload,
} from "@/app/lib/orders/customerEsimUsage";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";

/** Idempotency prefix — encodes MAP local source order without a schema change. */
export const ADD_DATA_IDEMPOTENCY_PREFIX = "adddata_";

const LOCAL_ORDER_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Build a wallet-purchase idempotency key that binds Add Data checkout to a
 * MAP local order id. VeSIM rechargeOrderId is resolved from that order's
 * providerOrderId at credit-checkout time (never store MAP id as recharge id).
 */
export function buildAddDataIdempotencyKey(localOrderId: string): string {
  const orderId = (localOrderId ?? "").trim();
  const nonce = randomBytes(8).toString("hex");
  return `${ADD_DATA_IDEMPOTENCY_PREFIX}${nonce}_${orderId}`;
}

/** Extract MAP local source order id from an Add Data idempotency key. */
export function parseAddDataSourceOrderId(
  idempotencyKey: string | null | undefined
): string | null {
  const key = (idempotencyKey ?? "").trim();
  if (!key.startsWith(ADD_DATA_IDEMPOTENCY_PREFIX)) return null;
  const rest = key.slice(ADD_DATA_IDEMPOTENCY_PREFIX.length);
  const sep = rest.indexOf("_");
  if (sep <= 0 || sep >= rest.length - 1) return null;
  const nonce = rest.slice(0, sep);
  const orderId = rest.slice(sep + 1).trim();
  if (!/^[a-f0-9]{16}$/i.test(nonce)) return null;
  if (
    !orderId ||
    orderId.length > 64 ||
    !LOCAL_ORDER_ID_RE.test(orderId)
  ) {
    return null;
  }
  return orderId;
}

export function normalizeAddDataFromOrderId(
  raw: unknown
): string | null {
  const id = String(raw ?? "").trim();
  if (!id || id.length > 64 || !LOCAL_ORDER_ID_RE.test(id)) return null;
  return id;
}

/**
 * Live VeSIM usage expiry for Add More Data checkout.
 * Returns true only when usage proves expired (isExpired or expiresAt <= now).
 * Unknown / unavailable usage → false (does not invent expiry from validity).
 */
export async function isEncryptedOrderIccidExpiredForAddData(
  iccidEncrypted: string | null | undefined
): Promise<boolean> {
  const encrypted = (iccidEncrypted ?? "").trim();
  if (!encrypted || !isIccidEncryptionConfigured()) return false;

  let iccid: string;
  try {
    const plain = decryptIccid(encrypted);
    const normalized = normalizeIccid(plain);
    if (!validateIccid(normalized)) return false;
    iccid = normalized;
  } catch {
    return false;
  }

  const usageRes = await fetchProviderUsage(iccid);
  if (!usageRes.ok) return false;
  const snapshot = normalizeProviderUsagePayload(usageRes.payload);
  if (!snapshot) return false;

  return isProviderUsageExpired({
    expiresAt: snapshot.expiresAt,
    isExpired: snapshot.isExpired,
  });
}

/**
 * Resolve VeSIM rechargeOrderId for an owned MAP order.
 * Returns null when missing/unauthorized/expired — callers must fail closed for Add Data.
 */
export async function resolveOwnedRechargeOrderId(options: {
  customerUserId: string;
  localOrderId: string;
}): Promise<string | null> {
  const customerUserId = options.customerUserId.trim();
  const localOrderId = normalizeAddDataFromOrderId(options.localOrderId);
  if (!customerUserId || customerUserId.length > 64 || !localOrderId) {
    return null;
  }

  const owner = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) {
    return null;
  }

  const order = await prisma.order.findFirst({
    where: { id: localOrderId, userId: owner.id },
    select: {
      id: true,
      status: true,
      providerOrderId: true,
      iccidEncrypted: true,
      walletEsimPurchase: { select: { status: true } },
      adminPackageAssignment: { select: { status: true } },
    },
  });
  if (!order) return null;

  const statusBadge = resolveCustomerEsimStatusBadge({
    orderStatus: order.status,
    walletPurchaseStatus: order.walletEsimPurchase?.status,
    assignmentStatus: order.adminPackageAssignment?.status,
  });
  if (statusBadge === "Refunded") return null;
  if (order.status !== OrderStatus.COMPLETED || statusBadge !== "Completed") {
    return null;
  }

  if (await isEncryptedOrderIccidExpiredForAddData(order.iccidEncrypted)) {
    return null;
  }

  const providerOrderId = (order.providerOrderId ?? "").trim();
  return providerOrderId || null;
}
