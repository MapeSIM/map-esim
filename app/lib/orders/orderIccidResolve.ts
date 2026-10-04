/**
 * Resolve stored ICCID for an order, with Add More Data source fallback.
 * Never logs ciphertext. Plaintext may be returned to authenticated order UIs.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { resolveAddDataPurchaseLabel } from "@/app/lib/esim/addDataPurchaseLabelShared";
import {
  decryptIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCrypto";

function decryptStoredIccid(
  iccidEncrypted: string | null | undefined
): string | null {
  const encrypted = (iccidEncrypted ?? "").trim();
  if (!encrypted || !isIccidEncryptionConfigured()) return null;
  try {
    const plain = decryptIccid(encrypted);
    const normalized = normalizeIccid(plain);
    return validateIccid(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/** Pending / missing label when no plaintext ICCID is available. */
export function iccidUnavailableLabel(
  orderStatus: string | null | undefined
): string {
  if ((orderStatus ?? "").trim() === "FAILED") return "Not provided";
  return "Pending from provider";
}

/**
 * Plaintext ICCID for usage/recon paths.
 * Prefers the order's own stored ICCID; for Add More Data top-ups without a
 * local capture, falls back to the source order's ICCID.
 */
export async function resolveOrderIccidPlaintext(
  localOrderIdRaw: string
): Promise<string | null> {
  const localOrderId = (localOrderIdRaw ?? "").trim();
  if (
    !localOrderId ||
    localOrderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(localOrderId)
  ) {
    return null;
  }

  const order = await prisma.order.findFirst({
    where: { id: localOrderId },
    select: {
      iccidEncrypted: true,
      walletEsimPurchase: { select: { idempotencyKey: true } },
      partnerEsimPurchase: { select: { idempotencyKey: true } },
    },
  });
  if (!order) return null;

  const own = decryptStoredIccid(order.iccidEncrypted);
  if (own) return own;

  const addData = resolveAddDataPurchaseLabel([
    order.walletEsimPurchase?.idempotencyKey,
    order.partnerEsimPurchase?.idempotencyKey,
  ]);
  if (!addData.addDataSourceOrderId) return null;

  const source = await prisma.order.findFirst({
    where: { id: addData.addDataSourceOrderId },
    select: { iccidEncrypted: true },
  });
  return decryptStoredIccid(source?.iccidEncrypted);
}

/**
 * Display last-4 for an order. Falls back to Add More Data source order when
 * the top-up row has no captured last-4 yet.
 */
export async function resolveOrderIccidLast4ForDisplay(options: {
  iccidLast4?: string | null;
  walletIdempotencyKey?: string | null;
  partnerIdempotencyKey?: string | null;
}): Promise<string | null> {
  const own = (options.iccidLast4 ?? "").replace(/\D+/g, "");
  if (own.length === 4) return own;

  const addData = resolveAddDataPurchaseLabel([
    options.walletIdempotencyKey,
    options.partnerIdempotencyKey,
  ]);
  if (!addData.addDataSourceOrderId) return null;

  const source = await prisma.order.findFirst({
    where: { id: addData.addDataSourceOrderId },
    select: { iccidLast4: true },
  });
  const last4 = (source?.iccidLast4 ?? "").replace(/\D+/g, "");
  return last4.length === 4 ? last4 : null;
}

/**
 * Batch-resolve source last-4 for Add Data rows missing their own capture.
 * Returns Map<sourceOrderId, last4>.
 */
export async function loadAddDataSourceIccidLast4Map(
  sourceOrderIds: string[]
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      sourceOrderIds
        .map((id) => (id ?? "").trim())
        .filter((id) => id && id.length <= 64)
    ),
  ];
  const out = new Map<string, string>();
  if (!ids.length) return out;

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: { id: true, iccidLast4: true },
  });
  for (const row of rows) {
    const last4 = (row.iccidLast4 ?? "").replace(/\D+/g, "");
    if (last4.length === 4) out.set(row.id, last4);
  }
  return out;
}

/**
 * Batch-resolve plaintext ICCIDs for order list/detail UIs.
 * Includes Add More Data source fallback when the top-up row has no capture.
 */
export async function loadOrderIccidPlaintextMap(
  orderIds: string[]
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      orderIds
        .map((id) => (id ?? "").trim())
        .filter((id) => id && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id))
    ),
  ];
  const out = new Map<string, string>();
  if (!ids.length || !isIccidEncryptionConfigured()) return out;

  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      iccidEncrypted: true,
      walletEsimPurchase: { select: { idempotencyKey: true } },
      partnerEsimPurchase: { select: { idempotencyKey: true } },
    },
  });

  const missingSourceByOrderId = new Map<string, string>();
  for (const row of rows) {
    const own = decryptStoredIccid(row.iccidEncrypted);
    if (own) {
      out.set(row.id, own);
      continue;
    }
    const addData = resolveAddDataPurchaseLabel([
      row.walletEsimPurchase?.idempotencyKey,
      row.partnerEsimPurchase?.idempotencyKey,
    ]);
    if (addData.addDataSourceOrderId) {
      missingSourceByOrderId.set(row.id, addData.addDataSourceOrderId);
    }
  }

  const sourceIds = [...new Set(missingSourceByOrderId.values())];
  if (!sourceIds.length) return out;

  const sources = await prisma.order.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, iccidEncrypted: true },
  });
  const sourcePlain = new Map<string, string>();
  for (const source of sources) {
    const plain = decryptStoredIccid(source.iccidEncrypted);
    if (plain) sourcePlain.set(source.id, plain);
  }
  for (const [orderId, sourceId] of missingSourceByOrderId) {
    const plain = sourcePlain.get(sourceId);
    if (plain) out.set(orderId, plain);
  }
  return out;
}
