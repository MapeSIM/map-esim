-- Partner refund REQUEST foundation (no money movement).

CREATE TYPE "PartnerRefundRequestReason" AS ENUM (
  'ESIM_NOT_RECEIVED',
  'INSTALL_DETAILS_UNAVAILABLE',
  'PROVIDER_OR_ORDER_ISSUE',
  'OTHER'
);

CREATE TABLE "PartnerRefundRequest" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "partnerEsimPurchaseId" TEXT NOT NULL,
  "orderId" TEXT,
  "reason" "PartnerRefundRequestReason" NOT NULL,
  "partnerNote" TEXT,
  "status" "RefundRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "partnerChargeCents" INTEGER NOT NULL,
  "retailPriceCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "openPurchaseKey" TEXT,
  "adminDecisionNote" TEXT,
  "executedRefundTransactionId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PartnerRefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerRefundRequest_openPurchaseKey_key" ON "PartnerRefundRequest"("openPurchaseKey");
CREATE INDEX "PartnerRefundRequest_partnerId_idx" ON "PartnerRefundRequest"("partnerId");
CREATE INDEX "PartnerRefundRequest_partnerEsimPurchaseId_idx" ON "PartnerRefundRequest"("partnerEsimPurchaseId");
CREATE INDEX "PartnerRefundRequest_orderId_idx" ON "PartnerRefundRequest"("orderId");
CREATE INDEX "PartnerRefundRequest_status_idx" ON "PartnerRefundRequest"("status");
CREATE INDEX "PartnerRefundRequest_createdAt_idx" ON "PartnerRefundRequest"("createdAt");
CREATE INDEX "PartnerRefundRequest_partnerId_createdAt_idx" ON "PartnerRefundRequest"("partnerId", "createdAt");
CREATE INDEX "PartnerRefundRequest_status_createdAt_idx" ON "PartnerRefundRequest"("status", "createdAt");

ALTER TABLE "PartnerRefundRequest" ADD CONSTRAINT "PartnerRefundRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerRefundRequest" ADD CONSTRAINT "PartnerRefundRequest_partnerEsimPurchaseId_fkey" FOREIGN KEY ("partnerEsimPurchaseId") REFERENCES "PartnerEsimPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerRefundRequest" ADD CONSTRAINT "PartnerRefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
