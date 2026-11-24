-- Partner white-label WhatsApp support number for /share/[token] FAB.
ALTER TABLE "PartnerProfile" ADD COLUMN IF NOT EXISTS "shareWhatsAppNumber" TEXT;
