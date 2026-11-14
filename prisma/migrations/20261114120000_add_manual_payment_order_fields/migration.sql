-- Additive: Order manual-payment proof columns + WhatsAppCheckoutOrder proof fields.
-- Safe for Neon / production — no drops.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT DEFAULT 'SAFEPAY';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "senderName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentProofUrl" TEXT;

ALTER TABLE "WhatsAppCheckoutOrder" ADD COLUMN IF NOT EXISTS "senderName" TEXT;
ALTER TABLE "WhatsAppCheckoutOrder" ADD COLUMN IF NOT EXISTS "paymentProofUrl" TEXT;
