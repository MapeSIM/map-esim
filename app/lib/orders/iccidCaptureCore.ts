/**
 * Fill-once ICCID capture (testable without server-only gate).
 * App server entrypoints must import via iccidCapture.ts.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
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

function extractIccidFromPayload(
  payload: Record<string, unknown> | null | undefined
): string | undefined {
  if (!payload) return undefined;
  return extractInstallDetails(payload).iccid;
}

/**
 * Fill-once ICCID capture bound to providerOrderId.
 * Never overwrites a different stored ICCID. Never logs ICCID values.
 */
export async function captureIccidForProviderOrder(
  options: {
    providerOrderId: string;
    iccid?: string | null;
    checkoutPayload?: Record<string, unknown> | null;
  },
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
      return { status: "duplicate_other_order" };
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
