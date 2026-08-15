-- Partner Phase 2 Slice 1 (enums only).
-- Postgres requires new enum values to be committed before use in defaults/columns.
ALTER TYPE "OrderFundingSource" ADD VALUE 'PARTNER_BALANCE';
ALTER TYPE "PartnerWalletTransactionType" ADD VALUE 'ESIM_PURCHASE_DEBIT';
ALTER TYPE "PartnerWalletTransactionType" ADD VALUE 'ESIM_PURCHASE_REFUND';
ALTER TYPE "OperationalControlKey" ADD VALUE 'PARTNER_WALLET_PURCHASES';
