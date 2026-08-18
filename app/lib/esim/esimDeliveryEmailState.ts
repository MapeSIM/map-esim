/**
 * Pure derived-state helpers for MAP eSIM alternate delivery email.
 * Side-effect free. "Confirmed" is customer attestation only — not ownership proof.
 */

export type PurchaseDeliveryRecipientState =
  | "account_default"
  | "confirmed_alternate";

export type PurchaseDeliveryLockState = "unlocked" | "locked";

function hasTimestamp(value: Date | string | null | undefined): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return String(value).trim() !== "";
}

function hasNonEmptyEmail(value: string | null | undefined): boolean {
  return (value ?? "").trim() !== "";
}

/** Null / unconfirmed alternate email means existing account-email delivery. */
export function classifyPurchaseDeliveryRecipient(input: {
  alternateDeliveryEmail?: string | null;
  alternateDeliveryEmailConfirmedAt?: Date | string | null;
}): PurchaseDeliveryRecipientState {
  if (
    hasNonEmptyEmail(input.alternateDeliveryEmail) &&
    hasTimestamp(input.alternateDeliveryEmailConfirmedAt)
  ) {
    return "confirmed_alternate";
  }
  return "account_default";
}

/**
 * Lock is independent of whether an alternate email exists.
 * lockedAt is claimed later at fulfillment.
 */
export function classifyPurchaseDeliveryLock(input: {
  alternateDeliveryEmailLockedAt?: Date | string | null;
}): PurchaseDeliveryLockState {
  return hasTimestamp(input.alternateDeliveryEmailLockedAt)
    ? "locked"
    : "unlocked";
}

export function isPurchaseDeliveryEmailLocked(
  lockedAt: Date | string | null | undefined
): boolean {
  return (
    classifyPurchaseDeliveryLock({
      alternateDeliveryEmailLockedAt: lockedAt,
    }) === "locked"
  );
}
