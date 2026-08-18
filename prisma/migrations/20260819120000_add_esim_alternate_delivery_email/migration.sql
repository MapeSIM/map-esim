-- P1B: additive alternate MAP eSIM delivery-email schema foundation.
-- Customer confirmation only — no OTP, verification code, or challenge table.
-- Additive nullable columns only on existing tables. No destructive SQL or backfill.
-- Null alternate email preserves existing account-email behavior.
-- CHECK is NOT VALID: existing rows are not scanned here; new writes are still enforced.
-- VALIDATE is a later controlled migration.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "alternateDeliveryEmail" TEXT;

ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "alternateDeliveryEmail" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "alternateDeliveryEmailConfirmedAt" TIMESTAMP(3);
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "alternateDeliveryEmailLockedAt" TIMESTAMP(3);

-- email null <=> confirmedAt null. lockedAt is intentionally unconstrained
-- (account-email delivery can also lock).
ALTER TABLE "WalletEsimPurchase"
  ADD CONSTRAINT "WalletEsimPurchase_alternate_delivery_email_confirmed_ck"
  CHECK (
    (
      "alternateDeliveryEmail" IS NULL
      AND "alternateDeliveryEmailConfirmedAt" IS NULL
    )
    OR (
      "alternateDeliveryEmail" IS NOT NULL
      AND "alternateDeliveryEmailConfirmedAt" IS NOT NULL
    )
  ) NOT VALID;
