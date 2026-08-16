-- Customer checkout promo codes (additive). Isolated local migrate only.

CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED_USD');

CREATE TYPE "PromoRedemptionStatus" AS ENUM ('HELD', 'COMPLETED', 'RELEASED');

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "PromoDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "totalUsageLimit" INTEGER,
    "perCustomerUsageLimit" INTEGER,
    "minimumOrderCents" INTEGER,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_isActive_idx" ON "PromoCode"("isActive");
CREATE INDEX "PromoCode_startsAt_idx" ON "PromoCode"("startsAt");
CREATE INDEX "PromoCode_endsAt_idx" ON "PromoCode"("endsAt");
CREATE INDEX "PromoCode_createdAt_idx" ON "PromoCode"("createdAt");

CREATE TABLE "PromoCodeDestination" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "destinationCode" TEXT NOT NULL,

    CONSTRAINT "PromoCodeDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCodeDestination_promoCodeId_destinationCode_key" ON "PromoCodeDestination"("promoCodeId", "destinationCode");
CREATE INDEX "PromoCodeDestination_destinationCode_idx" ON "PromoCodeDestination"("destinationCode");

CREATE TABLE "PromoCodeOffer" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,

    CONSTRAINT "PromoCodeOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCodeOffer_promoCodeId_offerId_key" ON "PromoCodeOffer"("promoCodeId", "offerId");
CREATE INDEX "PromoCodeOffer_offerId_idx" ON "PromoCodeOffer"("offerId");

CREATE TABLE "PromoCodeRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "walletEsimPurchaseId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "PromoRedemptionStatus" NOT NULL DEFAULT 'HELD',
    "promoCodeNormalized" TEXT NOT NULL,
    "discountType" "PromoDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "originalPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "finalPriceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PromoCodeRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCodeRedemption_walletEsimPurchaseId_key" ON "PromoCodeRedemption"("walletEsimPurchaseId");
CREATE INDEX "PromoCodeRedemption_promoCodeId_idx" ON "PromoCodeRedemption"("promoCodeId");
CREATE INDEX "PromoCodeRedemption_customerUserId_idx" ON "PromoCodeRedemption"("customerUserId");
CREATE INDEX "PromoCodeRedemption_status_idx" ON "PromoCodeRedemption"("status");
CREATE INDEX "PromoCodeRedemption_promoCodeId_customerUserId_status_idx" ON "PromoCodeRedemption"("promoCodeId", "customerUserId", "status");
CREATE INDEX "PromoCodeRedemption_createdAt_idx" ON "PromoCodeRedemption"("createdAt");

ALTER TABLE "WalletEsimPurchase" ADD COLUMN "promoCodeId" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN "promoCodeNormalized" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN "promoDiscountCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WalletEsimPurchase" DROP CONSTRAINT "WalletEsimPurchase_funding_breakdown_check";
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_funding_breakdown_check"
CHECK (
  "walletAppliedCents" >= 0
  AND "gatewayAmountCents" >= 0
  AND "promoDiscountCents" >= 0
  AND "promoDiscountCents" <= "priceCents"
  AND "walletAppliedCents" + "gatewayAmountCents" = "priceCents" - "promoDiscountCents"
);

CREATE INDEX "WalletEsimPurchase_promoCodeId_idx" ON "WalletEsimPurchase"("promoCodeId");

ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromoCodeDestination" ADD CONSTRAINT "PromoCodeDestination_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeOffer" ADD CONSTRAINT "PromoCodeOffer_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_walletEsimPurchaseId_fkey" FOREIGN KEY ("walletEsimPurchaseId") REFERENCES "WalletEsimPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
