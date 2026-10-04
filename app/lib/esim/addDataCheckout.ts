import "server-only";

import { createHash } from "node:crypto";
import {
  OrderStatus,
  PartnerEsimPurchaseStatus,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { isProviderUsageExpired } from "@/app/lib/esim/esimLifecycleNotificationShared";
import {
  customerEsimLineReady,
  resolveCustomerEsimStatusBadge,
} from "@/app/lib/orders/customerOrderDisplay";
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
import { normalizeOfferId } from "@/app/lib/vesim/server";
import {
  ADD_DATA_IDEMPOTENCY_PREFIX,
  isAddDataIdempotencyKey,
  parseAddDataSourceOrderId,
  resolveAddDataPurchaseLabel,
  type AddDataPurchaseLabel,
} from "@/app/lib/esim/addDataPurchaseLabelShared";

export {
  ADD_DATA_IDEMPOTENCY_PREFIX,
  isAddDataIdempotencyKey,
  parseAddDataSourceOrderId,
  resolveAddDataPurchaseLabel,
};
export type { AddDataPurchaseLabel };

const LOCAL_ORDER_ID_RE = /^[A-Za-z0-9_-]+$/;
const ADD_DATA_KEY_MAX_GENERATION = 64;

export type AddDataIdempotencyOwnerKind = "customer" | "admin" | "partner";

export type BuildAddDataIdempotencyKeyInput = {
  localOrderId: string;
  ownerKind: AddDataIdempotencyOwnerKind;
  /** Customer user id, or Partner profile id. */
  ownerId: string;
  offerId: string;
  /** Bumped after COMPLETED / FAILED_REFUNDED so a new top-up can start. */
  generation?: number;
  /** Admin-assisted only — separates assisted keys from self-service. */
  adminUserId?: string | null;
};

/**
 * Stable Add More Data idempotency key.
 * Format preserved for parseAddDataSourceOrderId:
 *   adddata_<16-hex-fingerprint>_<localOrderId>
 * Fingerprint covers owner + offer + generation (not a random nonce).
 */
export function buildAddDataIdempotencyKey(
  input: BuildAddDataIdempotencyKeyInput
): string {
  const orderId = (input.localOrderId ?? "").trim();
  const ownerId = (input.ownerId ?? "").trim();
  const offerId =
    normalizeOfferId(input.offerId) || (input.offerId ?? "").trim();
  const generation =
    Number.isInteger(input.generation) && (input.generation as number) >= 0
      ? (input.generation as number)
      : 0;
  const adminUserId =
    input.ownerKind === "admin" ? (input.adminUserId ?? "").trim() : "";

  const material = [
    "adddata-v1",
    input.ownerKind,
    ownerId,
    adminUserId,
    offerId,
    String(generation),
    orderId,
  ].join("|");
  const nonce = createHash("sha256")
    .update(material, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `${ADD_DATA_IDEMPOTENCY_PREFIX}${nonce}_${orderId}`;
}

function isWalletAddDataTerminalStatus(
  status: WalletEsimPurchaseStatus
): boolean {
  return (
    status === WalletEsimPurchaseStatus.COMPLETED ||
    status === WalletEsimPurchaseStatus.FAILED_REFUNDED
  );
}

function isPartnerAddDataTerminalStatus(
  status: PartnerEsimPurchaseStatus
): boolean {
  return (
    status === PartnerEsimPurchaseStatus.COMPLETED ||
    status === PartnerEsimPurchaseStatus.FAILED_REFUNDED
  );
}

/**
 * Pick a stable Add Data key for customer/admin wallet prepare:
 * - READY / in-flight → reuse same key (double-submit safe)
 * - COMPLETED → next generation (new top-up allowed)
 * - FAILED_REFUNDED → next generation (retry allowed)
 */
export async function resolveWalletAddDataIdempotencyKey(
  input: Omit<BuildAddDataIdempotencyKeyInput, "generation">
): Promise<string> {
  for (let generation = 0; generation < ADD_DATA_KEY_MAX_GENERATION; generation++) {
    const key = buildAddDataIdempotencyKey({ ...input, generation });
    const existing = await prisma.walletEsimPurchase.findUnique({
      where: { idempotencyKey: key },
      select: { status: true, customerUserId: true },
    });
    if (!existing) return key;
    if (existing.customerUserId !== input.ownerId.trim()) {
      continue;
    }
    if (isWalletAddDataTerminalStatus(existing.status)) {
      continue;
    }
    // READY / DRAFT / funded / provider-pending / recon → reuse.
    return key;
  }
  // Exhausted generations — last key still binds source order for parse/recharge.
  return buildAddDataIdempotencyKey({
    ...input,
    generation: ADD_DATA_KEY_MAX_GENERATION - 1,
  });
}

/**
 * Pick a stable Add Data key for Partner prepare/buy (same reuse rules).
 */
export async function resolvePartnerAddDataIdempotencyKey(input: {
  localOrderId: string;
  /** Partner profile id. */
  ownerId: string;
  offerId: string;
}): Promise<string> {
  const base: BuildAddDataIdempotencyKeyInput = {
    localOrderId: input.localOrderId,
    ownerKind: "partner",
    ownerId: input.ownerId,
    offerId: input.offerId,
  };
  for (let generation = 0; generation < ADD_DATA_KEY_MAX_GENERATION; generation++) {
    const key = buildAddDataIdempotencyKey({ ...base, generation });
    const existing = await prisma.partnerEsimPurchase.findUnique({
      where: { idempotencyKey: key },
      select: { status: true, partnerId: true },
    });
    if (!existing) return key;
    if (existing.partnerId !== input.ownerId.trim()) {
      continue;
    }
    if (isPartnerAddDataTerminalStatus(existing.status)) {
      continue;
    }
    return key;
  }
  return buildAddDataIdempotencyKey({
    ...base,
    generation: ADD_DATA_KEY_MAX_GENERATION - 1,
  });
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
      providerLifecycleStatus: true,
      walletEsimPurchase: { select: { status: true } },
      adminPackageAssignment: { select: { status: true } },
    },
  });
  if (!order) return null;

  const statusBadge = resolveCustomerEsimStatusBadge({
    orderStatus: order.status,
    walletPurchaseStatus: order.walletEsimPurchase?.status,
    assignmentStatus: order.adminPackageAssignment?.status,
    providerLifecycleStatus: order.providerLifecycleStatus,
  });
  if (statusBadge === "Refunded") return null;
  if (
    order.status !== OrderStatus.COMPLETED ||
    !customerEsimLineReady(statusBadge)
  ) {
    return null;
  }

  if (await isEncryptedOrderIccidExpiredForAddData(order.iccidEncrypted)) {
    return null;
  }

  const providerOrderId = (order.providerOrderId ?? "").trim();
  return providerOrderId || null;
}
