/**
 * Fill-once ICCID capture (testable without server-only gate).
 * App server entrypoints must import via iccidCapture.ts.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { isAddDataIdempotencyKey } from "@/app/lib/esim/addDataPurchaseLabelShared";
import { extractInstallDetails } from "@/app/lib/email/extract";
import {
  buildIccidPersistFields,
  hashIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "@/app/lib/orders/iccidCryptoCore";

export type CaptureIccidStatus =
  | "stored"
  | "already_same"
  | "skipped_empty"
  | "skipped_invalid"
  | "skipped_no_encryption"
  | "conflict"
  | "duplicate_other_order"
  | "order_not_found"
  | "failed";

export type CaptureIccidResult = {
  status: CaptureIccidStatus;
};

export type IccidCaptureDbClient = Prisma.TransactionClient | PrismaClient;

export type CaptureIccidOptions = {
  providerOrderId: string;
  iccid?: string | null;
  checkoutPayload?: Record<string, unknown> | null;
  /**
   * When true, allow storing an ICCID hash that already exists on another order.
   * Used for Add More Data / top-up orders that intentionally reuse the source ICCID.
   */
  allowSharedIccid?: boolean;
};

function extractIccidFromPayload(
  payload: Record<string, unknown> | null | undefined
): string | undefined {
  if (!payload) return undefined;
  return extractInstallDetails(payload).iccid;
}

type PurchaseLookupDelegate = {
  findFirst: (args: {
    where: {
      OR: Array<{ providerOrderId: string } | { orderId: string }>;
    };
    select: { idempotencyKey: true };
  }) => Promise<{ idempotencyKey: string } | null>;
};

function asPurchaseDelegate(value: unknown): PurchaseLookupDelegate | null {
  if (!value || typeof value !== "object") return null;
  const findFirst = (value as { findFirst?: unknown }).findFirst;
  return typeof findFirst === "function"
    ? (value as PurchaseLookupDelegate)
    : null;
}

/**
 * Detect Add More Data via linked wallet/partner purchase idempotency key.
 * Safe when purchase delegates are absent (unit mocks).
 */
async function orderIsAddDataTopUp(
  client: IccidCaptureDbClient,
  providerOrderId: string,
  orderId: string
): Promise<boolean> {
  const wallet = asPurchaseDelegate(
    (client as PrismaClient).walletEsimPurchase
  );
  if (wallet) {
    try {
      const row = await wallet.findFirst({
        where: {
          OR: [{ providerOrderId }, { orderId }],
        },
        select: { idempotencyKey: true },
      });
      if (isAddDataIdempotencyKey(row?.idempotencyKey)) return true;
    } catch {
      // Mock clients may not implement purchase lookups.
    }
  }

  const partner = asPurchaseDelegate(
    (client as PrismaClient).partnerEsimPurchase
  );
  if (partner) {
    try {
      const row = await partner.findFirst({
        where: {
          OR: [{ providerOrderId }, { orderId }],
        },
        select: { idempotencyKey: true },
      });
      if (isAddDataIdempotencyKey(row?.idempotencyKey)) return true;
    } catch {
      // Mock clients may not implement purchase lookups.
    }
  }

  return false;
}

/**
 * Fill-once ICCID capture bound to providerOrderId.
 * Never overwrites a different stored ICCID. Never logs ICCID values.
 * Add More Data / top-up orders may share an ICCID hash with the source order.
 */
export async function captureIccidForProviderOrder(
  options: CaptureIccidOptions,
  client: IccidCaptureDbClient
): Promise<CaptureIccidResult> {
  const providerOrderId = options.providerOrderId.trim();
  if (!providerOrderId) {
    return { status: "order_not_found" };
  }

  const raw =
    options.iccid?.trim() ||
    extractIccidFromPayload(options.checkoutPayload || undefined) ||
    "";
  if (!raw) {
    return { status: "skipped_empty" };
  }

  const normalized = normalizeIccid(raw);
  if (!validateIccid(normalized)) {
    return { status: "skipped_invalid" };
  }

  if (!isIccidEncryptionConfigured()) {
    console.error("ICCID capture skipped: encryption unavailable");
    return { status: "skipped_no_encryption" };
  }

  let hash: string;
  let fields: ReturnType<typeof buildIccidPersistFields>;
  try {
    hash = hashIccid(normalized);
    fields = buildIccidPersistFields(normalized);
  } catch {
    console.error("ICCID capture skipped: crypto failure");
    return { status: "failed" };
  }

  if (!fields) {
    return { status: "skipped_no_encryption" };
  }

  try {
    const order = await client.order.findUnique({
      where: { providerOrderId },
      select: {
        id: true,
        providerOrderId: true,
        iccidHash: true,
      },
    });

    if (!order) {
      return { status: "order_not_found" };
    }

    if (order.iccidHash) {
      if (order.iccidHash === hash) {
        return { status: "already_same" };
      }
      return { status: "conflict" };
    }

    const other = await client.order.findFirst({
      where: {
        iccidHash: hash,
        NOT: { id: order.id },
      },
      select: { id: true },
    });
    if (other) {
      const allowShared =
        options.allowSharedIccid === true ||
        (await orderIsAddDataTopUp(client, providerOrderId, order.id));
      if (!allowShared) {
        return { status: "duplicate_other_order" };
      }
    }

    // Fill-once race-safe: only write when still null.
    const updated = await client.order.updateMany({
      where: {
        id: order.id,
        providerOrderId,
        iccidHash: null,
      },
      data: {
        iccidEncrypted: fields.iccidEncrypted,
        iccidHash: fields.iccidHash,
        iccidLast4: fields.iccidLast4,
        iccidCapturedAt: fields.iccidCapturedAt,
      },
    });

    if (updated.count === 0) {
      const again = await client.order.findUnique({
        where: { id: order.id },
        select: { iccidHash: true },
      });
      if (again?.iccidHash === hash) return { status: "already_same" };
      if (again?.iccidHash) return { status: "conflict" };
      return { status: "failed" };
    }

    return { status: "stored" };
  } catch {
    console.error("ICCID capture failed");
    return { status: "failed" };
  }
}
