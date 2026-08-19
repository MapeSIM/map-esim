-- P1B follow-up: validate existing CHECK after Production preflight
-- confirmed 0 email/ConfirmedAt mismatches. Scans existing rows only.
-- Does not add, drop, or rewrite columns.

ALTER TABLE "WalletEsimPurchase"
VALIDATE CONSTRAINT "WalletEsimPurchase_alternate_delivery_email_confirmed_ck";
