-- Append-only webhook delivery observability.
-- Never stores raw body, signatures, secrets, or card data.
-- eventId is intentionally not unique so Safepay retries remain visible.

CREATE TABLE "PaymentWebhookReceipt" (
    "id" TEXT NOT NULL,
    "provider" "PaymentGatewayProvider" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT,
    "eventType" TEXT,
    "signatureOk" BOOLEAN NOT NULL,
    "parseOk" BOOLEAN NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "logCode" TEXT NOT NULL,
    "errorCategory" TEXT,
    "applyOutcome" TEXT,
    "paymentAttemptId" TEXT,
    "topupId" TEXT,
    "trackerMasked" TEXT,

    CONSTRAINT "PaymentWebhookReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentWebhookReceipt_httpStatus_range" CHECK ("httpStatus" >= 100 AND "httpStatus" <= 599),
    CONSTRAINT "PaymentWebhookReceipt_logCode_len" CHECK (char_length("logCode") > 0 AND char_length("logCode") <= 64)
);

CREATE INDEX "PaymentWebhookReceipt_receivedAt_idx" ON "PaymentWebhookReceipt"("receivedAt");
CREATE INDEX "PaymentWebhookReceipt_eventId_idx" ON "PaymentWebhookReceipt"("eventId");
CREATE INDEX "PaymentWebhookReceipt_logCode_idx" ON "PaymentWebhookReceipt"("logCode");
CREATE INDEX "PaymentWebhookReceipt_paymentAttemptId_idx" ON "PaymentWebhookReceipt"("paymentAttemptId");
CREATE INDEX "PaymentWebhookReceipt_topupId_idx" ON "PaymentWebhookReceipt"("topupId");
