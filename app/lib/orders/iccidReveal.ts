import "server-only";

import { PartnerEsimPurchaseStatus, Role } from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";

export const ICCID_REVEAL_ADMIN_ACTION = "order.iccid_revealed_admin";
export const ICCID_REVEAL_CUSTOMER_ACTION = "order.iccid_revealed_customer";
export const ICCID_REVEAL_PARTNER_ACTION = "order.iccid_revealed_partner";

export type IccidRevealErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "PENDING"
  | "UNAVAILABLE";

export type IccidRevealResult =
  | { ok: true; iccid: string }
  | { ok: false; code: IccidRevealErrorCode };

function normalizeOrderId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

async function decryptStoredIccid(
  ciphertext: string | null | undefined
): Promise<IccidRevealResult> {
  const encrypted = (ciphertext ?? "").trim();
  if (!encrypted) {
    return { ok: false, code: "PENDING" };
  }
  if (!isIccidEncryptionConfigured()) {
    return { ok: false, code: "UNAVAILABLE" };
  }
  try {
    const plain = decryptIccid(encrypted);
    if (!validateIccid(plain)) {
      return { ok: false, code: "UNAVAILABLE" };
    }
    return { ok: true, iccid: plain };
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}

/**
 * Authorized ADMIN reveal. Never logs or audits the ICCID value.
 */
export async function revealIccidForAdmin(
  adminUserId: string,
  orderIdRaw: string
): Promise<IccidRevealResult> {
  const adminId = (adminUserId ?? "").trim();
  const orderId = normalizeOrderId(orderIdRaw);
  if (!adminId || adminId.length > 64 || !orderId) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, iccidEncrypted: true },
  });
  if (!order) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const result = await decryptStoredIccid(order.iccidEncrypted);
  if (!result.ok) return result;

  await writeAuditLog({
    actorUserId: admin.id,
    action: ICCID_REVEAL_ADMIN_ACTION,
    targetType: "Order",
    targetId: order.id,
    metadata: {
      // IDs only — never ICCID, last4, ciphertext, or install secrets.
      orderId: order.id,
    },
  });

  return result;
}

/**
 * Owning CUSTOMER reveal. Ownership is Order.userId === current user only.
 * Guest/unclaimed/other-customer orders return NOT_FOUND (no existence leak).
 */
export async function revealIccidForCustomer(
  customerUserId: string,
  orderIdRaw: string
): Promise<IccidRevealResult> {
  const customerId = (customerUserId ?? "").trim();
  const orderId = normalizeOrderId(orderIdRaw);
  if (!customerId || customerId.length > 64 || !orderId) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      userId: customer.id,
    },
    select: { id: true, iccidEncrypted: true },
  });
  if (!order) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const result = await decryptStoredIccid(order.iccidEncrypted);
  if (!result.ok) return result;

  await writeAuditLog({
    actorUserId: customer.id,
    action: ICCID_REVEAL_CUSTOMER_ACTION,
    targetType: "Order",
    targetId: order.id,
    metadata: {
      orderId: order.id,
    },
  });

  return result;
}

/**
 * Owning PARTNER reveal. Ownership is PartnerEsimPurchase.partnerId only.
 * Other Partner / missing / non-completed → NOT_FOUND (no existence leak).
 * Never logs or audits the ICCID value.
 */
export async function revealIccidForPartner(
  partnerUserId: string,
  orderIdRaw: string
): Promise<IccidRevealResult> {
  const orderId = normalizeOrderId(orderIdRaw);
  if (!orderId) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: actor.partnerId,
      orderId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
    },
    select: {
      id: true,
      order: {
        select: { id: true, iccidEncrypted: true },
      },
    },
  });
  if (!purchase?.order) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const result = await decryptStoredIccid(purchase.order.iccidEncrypted);
  if (!result.ok) return result;

  await writeAuditLog({
    actorUserId: actor.userId,
    action: ICCID_REVEAL_PARTNER_ACTION,
    targetType: "Order",
    targetId: purchase.order.id,
    metadata: {
      // IDs only — never ICCID, last4, ciphertext, or install secrets.
      orderId: purchase.order.id,
      purchaseId: purchase.id,
    },
  });

  return result;
}
