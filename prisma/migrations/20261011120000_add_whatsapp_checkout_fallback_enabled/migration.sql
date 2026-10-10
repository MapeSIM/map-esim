-- Decouple WhatsApp checkout fallback from the floating support button.
-- Default true so existing deployments keep checkout WhatsApp available.
ALTER TABLE "WhatsAppSupportConfig"
ADD COLUMN "checkoutFallbackEnabled" BOOLEAN NOT NULL DEFAULT true;
