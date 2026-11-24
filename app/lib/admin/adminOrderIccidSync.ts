/**
 * Admin ICCID provider sync — same fill-once capture path as Partner refresh /
 * stuck-case backfill. Never places or retries VeSIM purchases.
 */
import "server-only";

import { Role } from "@prisma/client";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma, withPrismaRetry } from "@/app/lib/db";
import { extractInstallDetails } from "@/app/lib/email/extract";
import { captureIccidForProviderOrder } from "@/app/lib/orders/iccidCapture";
import {
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";
import { fetchBrokerOrderPayload } from "@/app/lib/orders/customerOrderInstall";
import { resolveOrderIccidPlaintext } from "@/app/lib/orders/orderIccidResolve";

export type AdminIccidSyncResult =
  | { ok: true; iccid: string; synced: boolean }
  | {
      ok: false;
      code: "NOT_FOUND" | "PENDING" | "UNAVAILABLE" | "RATE_LIMITED";
    };

export async function syncAdminOrderIccidFromProvider(
  adminUserId: string,
  orderId: string
): Promise<AdminIccidSyncResult> {
  const adminId = (adminUserId ?? "").trim();
  const id = (orderId ?? "").trim();
  if (!adminId || !id) return { ok: false, code: "NOT_FOUND" };

  const admin = await withPrismaRetry(() =>
    prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
    })
  );
  if (
    !admin ||
    admin.deletedAt ||
    admin.role !== Role.ADMIN ||
    admin.adminDisabledAt
  ) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const order = await withPrismaRetry(() =>
    prisma.order.findUnique({
      where: { id },
      select: { id: true, providerOrderId: true },
    })
  );
  if (!order) return { ok: false, code: "NOT_FOUND" };

  const existing = await resolveOrderIccidPlaintext(order.id);
  if (existing) {
    return { ok: true, iccid: existing, synced: false };
  }

  if (!isIccidEncryptionConfigured()) {
    return { ok: false, code: "UNAVAILABLE" };
  }

  const providerOrderId = (order.providerOrderId ?? "").trim();
  if (!providerOrderId) {
    return { ok: false, code: "PENDING" };
  }

  const rate = consumeRateLimit({
    key: `admin-iccid-sync:${order.id}`,
    limit: 8,
    windowMs: 60_000,
  });
  if (!rate.ok) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  let broker: Record<string, unknown> | null;
  try {
    broker = await fetchBrokerOrderPayload(providerOrderId);
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
  if (!broker) {
    return { ok: false, code: "UNAVAILABLE" };
  }

  const extracted = normalizeIccid(
    extractInstallDetails(broker).iccid ?? ""
  );
  if (!extracted || !validateIccid(extracted)) {
    return { ok: false, code: "PENDING" };
  }

  try {
    const capture = await captureIccidForProviderOrder({
      providerOrderId,
      iccid: extracted,
      checkoutPayload: broker,
    });
    if (capture.status === "skipped_no_encryption") {
      return { ok: false, code: "UNAVAILABLE" };
    }
  } catch {
    console.error("admin_iccid_capture_failed");
    return { ok: false, code: "UNAVAILABLE" };
  }

  const again = await resolveOrderIccidPlaintext(order.id);
  if (again) {
    return { ok: true, iccid: again, synced: true };
  }
  // Capture may have raced; still surface provider ICCID for admin display.
  return { ok: true, iccid: extracted, synced: true };
}
