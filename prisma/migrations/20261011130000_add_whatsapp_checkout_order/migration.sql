-- CreateEnum
CREATE TYPE "WhatsAppCheckoutOrderStatus" AS ENUM ('WHATSAPP_PENDING', 'FULFILLED', 'CANCELLED');

-- AlterTable: optional checkout-only WhatsApp number (falls back to phoneE164)
ALTER TABLE "WhatsAppSupportConfig"
ADD COLUMN "checkoutPhoneE164" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppCheckoutOrder" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "WhatsAppCheckoutOrderStatus" NOT NULL DEFAULT 'WHATSAPP_PENDING',
    "paymentMethod" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "customerUserId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "whatsappPhone" TEXT,
    "offerId" TEXT NOT NULL,
    "destinationCode" TEXT,
    "destinationName" TEXT,
    "planName" TEXT NOT NULL,
    "dataAllowance" TEXT,
    "validity" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "walletEsimPurchaseId" TEXT,
    "orderId" TEXT,
    "adminPackageAssignmentId" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledByAdminId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByAdminId" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppCheckoutOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppCheckoutOrder_reference_key" ON "WhatsAppCheckoutOrder"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppCheckoutOrder_orderId_key" ON "WhatsAppCheckoutOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppCheckoutOrder_adminPackageAssignmentId_key" ON "WhatsAppCheckoutOrder"("adminPackageAssignmentId");

-- CreateIndex
CREATE INDEX "WhatsAppCheckoutOrder_status_createdAt_idx" ON "WhatsAppCheckoutOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppCheckoutOrder_customerUserId_createdAt_idx" ON "WhatsAppCheckoutOrder"("customerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppCheckoutOrder_customerEmail_idx" ON "WhatsAppCheckoutOrder"("customerEmail");

-- CreateIndex
CREATE INDEX "WhatsAppCheckoutOrder_walletEsimPurchaseId_idx" ON "WhatsAppCheckoutOrder"("walletEsimPurchaseId");

-- AddForeignKey
ALTER TABLE "WhatsAppCheckoutOrder" ADD CONSTRAINT "WhatsAppCheckoutOrder_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCheckoutOrder" ADD CONSTRAINT "WhatsAppCheckoutOrder_fulfilledByAdminId_fkey" FOREIGN KEY ("fulfilledByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCheckoutOrder" ADD CONSTRAINT "WhatsAppCheckoutOrder_cancelledByAdminId_fkey" FOREIGN KEY ("cancelledByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCheckoutOrder" ADD CONSTRAINT "WhatsAppCheckoutOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppCheckoutOrder" ADD CONSTRAINT "WhatsAppCheckoutOrder_adminPackageAssignmentId_fkey" FOREIGN KEY ("adminPackageAssignmentId") REFERENCES "AdminPackageAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
