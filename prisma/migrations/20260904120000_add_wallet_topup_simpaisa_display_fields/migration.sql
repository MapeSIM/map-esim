-- Persist Simpaisa wallet method + masked MSISDN for refresh-safe pending UX.
-- Never stores full MSISDN or secrets.
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "walletOperatorId" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "customerMsisdnMasked" TEXT;
