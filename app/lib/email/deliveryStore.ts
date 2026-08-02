import type { EmailDeliveryStatus } from "@/app/lib/email/types";

type DeliveryRecord = {
  status: EmailDeliveryStatus;
  customerEmail?: string;
  updatedAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const store = new Map<string, DeliveryRecord>();
/** In-flight claim locks to prevent concurrent duplicate sends. */
const inFlight = new Set<string>();

function prune(now = Date.now()) {
  for (const [orderId, record] of store.entries()) {
    if (record.updatedAt + TTL_MS <= now) {
      store.delete(orderId);
    }
  }
}

function normalizeOrderId(orderId: string): string {
  return orderId.trim().slice(0, 120);
}

export function getEmailDeliveryRecord(
  orderId: string
): DeliveryRecord | undefined {
  const key = normalizeOrderId(orderId);
  if (!key) return undefined;
  prune();
  return store.get(key);
}

export function markEmailDelivery(
  orderId: string,
  status: EmailDeliveryStatus,
  customerEmail?: string
): void {
  const key = normalizeOrderId(orderId);
  if (!key) return;
  prune();
  store.set(key, {
    status,
    customerEmail: customerEmail?.trim() || undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Atomically claim an order for sending. Returns false if already sent
 * or another send is in progress for this order ID.
 */
export function claimEmailSend(orderId: string): boolean {
  const key = normalizeOrderId(orderId);
  if (!key) return false;
  prune();

  if (inFlight.has(key)) return false;

  const existing = store.get(key);
  if (
    existing &&
    (existing.status === "sent" || existing.status === "already_sent")
  ) {
    return false;
  }

  inFlight.add(key);
  return true;
}

export function releaseEmailSendClaim(orderId: string): void {
  const key = normalizeOrderId(orderId);
  if (!key) return;
  inFlight.delete(key);
}

export function wasEmailAlreadySent(orderId: string): boolean {
  const record = getEmailDeliveryRecord(orderId);
  return record?.status === "sent" || record?.status === "already_sent";
}
