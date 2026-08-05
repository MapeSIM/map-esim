-- AlterTable
ALTER TABLE "WalletEsimPurchase" ADD COLUMN "adminUserId" TEXT,
ADD COLUMN "assistedPurchaseReason" TEXT;

-- CreateIndex
CREATE INDEX "WalletEsimPurchase_adminUserId_idx" ON "WalletEsimPurchase"("adminUserId");

-- AddForeignKey
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
