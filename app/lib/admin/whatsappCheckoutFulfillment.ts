/**
 * Admin fulfill / cancel for WhatsApp pending checkout orders.
 * Fulfillment reuses company-funded AdminPackageAssignment → VeSIM → email.
 */
import "server-only";

import { randomBytes } from "crypto";
import { WhatsAppCheckoutOrderStatus } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { findActiveAdminActor } from "@/app/lib/auth/adminAccess";
import {
  AdminPackageAssignmentError,
  confirmAdminPackageAssignment,
  prepareAdminPackageAssignment,
} from "@/app/lib/esim/adminPackageAssignment";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { cleanWhatsAppCustomerPhoneDigits } from "@/app/lib/support/whatsappCheckoutOrderShared";

export const WHATSAPP_CHECKOUT_FULFILLED_AUDIT =
  "whatsapp_checkout.fulfilled";
export const WHATSAPP_CHECKOUT_CANCELLED_AUDIT =
  "whatsapp_checkout.cancelled";

export type WhatsAppPendingOrderListItem = {
  id: string;
  reference: string;
  customerEmail: string;
  /** Digits-only customer WhatsApp when captured; null when unavailable. */
  customerPhone: string | null;
  planName: string;
  destination: string;
  amountLabel: string;
  status: WhatsAppCheckoutOrderStatus;
  createdAtLabel: string;
  paymentMethod: string;
};

export type WhatsAppFulfillResult =
  | { ok: true; message: string; orderId: string | null }
  | { ok: false; error: string };

function formatCreatedAt(value: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

export async function listWhatsAppPendingOrders(options?: {
  includeNonPending?: boolean;
  take?: number;
}): Promise<WhatsAppPendingOrderListItem[]> {
  const take = Math.min(100, Math.max(1, options?.take ?? 50));
  const rows = await prisma.whatsAppCheckoutOrder.findMany({
    where: options?.includeNonPending
      ? undefined
      : { status: WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      reference: true,
      customerEmail: true,
      whatsappPhone: true,
      planName: true,
      destinationName: true,
      destinationCode: true,
      amountCents: true,
      status: true,
      createdAt: true,
      paymentMethod: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    customerEmail: row.customerEmail,
    customerPhone: cleanWhatsAppCustomerPhoneDigits(row.whatsappPhone),
    planName: row.planName,
    destination:
      (row.destinationName || row.destinationCode || "").trim() || "—",
    amountLabel: formatUsdCents(row.amountCents),
    status: row.status,
    createdAtLabel: formatCreatedAt(row.createdAt),
    paymentMethod: row.paymentMethod,
  }));
}

export async function fulfillWhatsAppCheckoutOrder(input: {
  adminUserId: string;
  whatsappOrderId: string;
}): Promise<WhatsAppFulfillResult> {
  const adminUserId = (input.adminUserId ?? "").trim();
  const whatsappOrderId = (input.whatsappOrderId ?? "").trim();
  if (!adminUserId || !whatsappOrderId) {
    return { ok: false, error: "Invalid request." };
  }

  const admin = await findActiveAdminActor(adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  const pending = await prisma.whatsAppCheckoutOrder.findUnique({
    where: { id: whatsappOrderId },
    select: {
      id: true,
      reference: true,
      status: true,
      customerUserId: true,
      offerId: true,
      destinationCode: true,
      adminPackageAssignmentId: true,
      orderId: true,
    },
  });

  if (!pending) {
    return { ok: false, error: "WhatsApp order not found." };
  }

  if (pending.status === WhatsAppCheckoutOrderStatus.FULFILLED) {
    return {
      ok: true,
      message: "This WhatsApp order was already fulfilled.",
      orderId: pending.orderId,
    };
  }

  if (pending.status !== WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING) {
    return { ok: false, error: "Only pending WhatsApp orders can be fulfilled." };
  }

  const idempotencyKey = `wa_fulfill_${pending.id}`.slice(0, 128);

  try {
    const prepared = await prepareAdminPackageAssignment({
      adminUserId: admin.id,
      customerUserId: pending.customerUserId,
      offerId: pending.offerId,
      countryHint: pending.destinationCode,
      reason: `WhatsApp checkout payment verified (${pending.reference})`,
      internalReference: pending.reference,
      idempotencyKey,
    });

    const confirmed = await confirmAdminPackageAssignment({
      adminUserId: admin.id,
      customerUserId: pending.customerUserId,
      assignmentId: prepared.assignmentId,
      idempotencyKey,
    });

    await prisma.whatsAppCheckoutOrder.update({
      where: { id: pending.id },
      data: {
        status: WhatsAppCheckoutOrderStatus.FULFILLED,
        adminPackageAssignmentId: confirmed.assignmentId,
        orderId: confirmed.orderId,
        fulfilledAt: new Date(),
        fulfilledByAdminId: admin.id,
      },
    });

    await writeAuditLog({
      actorUserId: admin.id,
      action: WHATSAPP_CHECKOUT_FULFILLED_AUDIT,
      targetType: "WhatsAppCheckoutOrder",
      targetId: pending.id,
      metadata: {
        reference: pending.reference,
        assignmentId: confirmed.assignmentId,
        orderId: confirmed.orderId,
        duplicate: confirmed.duplicate,
      },
    });

    return {
      ok: true,
      message: confirmed.orderId
        ? `eSIM issued for ${pending.reference}. Confirmation email sent when delivery succeeds.`
        : `Fulfillment finished for ${pending.reference}.`,
      orderId: confirmed.orderId,
    };
  } catch (error) {
    if (error instanceof AdminPackageAssignmentError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Could not issue the eSIM. Check provider status and try again.",
    };
  }
}

export async function cancelWhatsAppCheckoutOrder(input: {
  adminUserId: string;
  whatsappOrderId: string;
  reason?: string | null;
}): Promise<WhatsAppFulfillResult> {
  const adminUserId = (input.adminUserId ?? "").trim();
  const whatsappOrderId = (input.whatsappOrderId ?? "").trim();
  if (!adminUserId || !whatsappOrderId) {
    return { ok: false, error: "Invalid request." };
  }

  const admin = await findActiveAdminActor(adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  const reason = (input.reason ?? "").trim().slice(0, 240) || null;

  const updated = await prisma.whatsAppCheckoutOrder.updateMany({
    where: {
      id: whatsappOrderId,
      status: WhatsAppCheckoutOrderStatus.WHATSAPP_PENDING,
    },
    data: {
      status: WhatsAppCheckoutOrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledByAdminId: admin.id,
      cancelReason: reason,
    },
  });

  if (updated.count !== 1) {
    return {
      ok: false,
      error: "Order is not pending or was already updated.",
    };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: WHATSAPP_CHECKOUT_CANCELLED_AUDIT,
    targetType: "WhatsAppCheckoutOrder",
    targetId: whatsappOrderId,
    metadata: {
      reason,
      nonce: randomBytes(4).toString("hex"),
    },
  });

  return {
    ok: true,
    message: "WhatsApp order cancelled.",
    orderId: null,
  };
}
