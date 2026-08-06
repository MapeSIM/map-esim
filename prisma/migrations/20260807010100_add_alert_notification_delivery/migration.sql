-- Monitoring & Alerts Part B2: durable notification lifecycle + delivery outbox.
-- Seeds ALERT_NOTIFICATIONS control as ACTIVE (paused=false).
-- No secret columns, recipient storage, message bodies, or customer PII.

CREATE TYPE "AlertNotificationEventType" AS ENUM ('INITIAL', 'REMINDER', 'RECOVERY');

CREATE TYPE "AlertNotificationDeliveryStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED');

CREATE TABLE "AlertNotificationState" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "alertCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceRecordRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activationSequence" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "nextReminderAt" TIMESTAMP(3),
    "recoveryNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertNotificationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertNotificationState_alertId_key" ON "AlertNotificationState"("alertId");
CREATE INDEX "AlertNotificationState_isActive_idx" ON "AlertNotificationState"("isActive");
CREATE INDEX "AlertNotificationState_lastSeenAt_idx" ON "AlertNotificationState"("lastSeenAt");
CREATE INDEX "AlertNotificationState_alertCode_idx" ON "AlertNotificationState"("alertCode");
CREATE INDEX "AlertNotificationState_activationSequence_idx" ON "AlertNotificationState"("activationSequence");

CREATE TABLE "AlertNotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "activationSequence" INTEGER NOT NULL,
    "eventType" "AlertNotificationEventType" NOT NULL,
    "status" "AlertNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertNotificationDelivery_eventKey_key" ON "AlertNotificationDelivery"("eventKey");
CREATE INDEX "AlertNotificationDelivery_status_nextAttemptAt_idx" ON "AlertNotificationDelivery"("status", "nextAttemptAt");
CREATE INDEX "AlertNotificationDelivery_alertId_activationSequence_idx" ON "AlertNotificationDelivery"("alertId", "activationSequence");
CREATE INDEX "AlertNotificationDelivery_claimedAt_idx" ON "AlertNotificationDelivery"("claimedAt");
CREATE INDEX "AlertNotificationDelivery_eventType_status_idx" ON "AlertNotificationDelivery"("eventType", "status");

ALTER TABLE "AlertNotificationDelivery"
  ADD CONSTRAINT "AlertNotificationDelivery_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "AlertNotificationState"("alertId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AlertNotificationRunnerLock" (
    "id" TEXT NOT NULL,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertNotificationRunnerLock_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AlertNotificationRunnerLock" ("id", "claimToken", "claimedAt", "claimExpiresAt", "updatedAt")
VALUES ('default', NULL, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "OperationalControl" ("id", "key", "paused", "version", "reason", "updatedByAdminId", "createdAt", "updatedAt")
VALUES
  ('opsctl_alert_notifications', 'ALERT_NOTIFICATIONS', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
