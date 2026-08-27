/**
 * Offline QA for customer eSIM lifecycle (expiry) notifications — V1 safety.
 * Does not call VeSIM, mutate orders, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderEsimLifecycleEmailHtml,
  renderEsimLifecycleEmailText,
} from "../app/lib/email/esimLifecycleTemplate";
import {
  buildEsimLifecycleEventKey,
  ESIM_LIFECYCLE_CRON_SCHEDULE_DAILY_UTC,
  ESIM_LIFECYCLE_DELIVERY_PRECEDENCE,
  ESIM_LIFECYCLE_EXPIRY_SOON_HOURS,
  ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT,
  ESIM_LIFECYCLE_V1_ENABLED_KINDS,
  evaluateEsimLifecycleDataEvents,
  evaluateEsimLifecycleEvents,
  evaluateEsimLifecycleExpiryEvents,
  formatLifecycleExpiryLabel,
  lifecycleSubject,
  parseProviderInstantMs,
  selectEsimLifecycleEventsForDelivery,
  type EsimLifecycleUsageInput,
} from "../app/lib/esim/esimLifecycleNotificationShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertNoSensitive(content: string) {
  const banned = [
    "ICCID",
    "iccid",
    "LPA:",
    "SM-DP+",
    "activationCode",
    "SMTP_PASSWORD",
    "providerPayload",
    "IMEI",
    "EID",
    "VeSIM",
  ];
  for (const token of banned) {
    assert.equal(
      content.includes(token),
      false,
      `sensitive token leaked: ${token}`
    );
  }
}

function baseUsage(
  partial: Partial<EsimLifecycleUsageInput> = {}
): EsimLifecycleUsageInput {
  return {
    expiresAt: null,
    daysRemaining: null,
    isExpired: null,
    isUnlimited: false,
    reportsDataAllowance: true,
    initialDataGB: 10,
    remainingDataGB: 5,
    ...partial,
  };
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260827120000_add_esim_lifecycle_notifications/migration.sql";
  assert.equal(existsSync(join(root, migrationPath)), true);
  const migration = read(migrationPath);
  const shared = read("app/lib/esim/esimLifecycleNotificationShared.ts");
  const notify = read("app/lib/esim/esimLifecycleNotification.ts");
  const runner = read("app/lib/esim/esimLifecycleNotificationRunner.ts");
  const template = read("app/lib/email/esimLifecycleTemplate.ts");
  const cron = read("app/api/cron/esim-lifecycle-notifications/route.ts");
  const vercel = read("vercel.json");
  const pkg = read("package.json");
  const usage = read("app/lib/orders/customerEsimUsage.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const partner = read("app/lib/partner/partnerEsimPurchase.ts");
  const refunds = read("app/lib/refunds/refundRequestExecution.ts");
  const rewards = read("app/lib/rewards/rewardRefund.ts");

  console.log("1) Schema + migration additive outbox");
  assert.match(schema, /enum EsimLifecycleNotificationKind/);
  assert.match(schema, /EXPIRY_SOON_24H/);
  assert.match(schema, /DATA_EXHAUSTED/);
  assert.match(schema, /model EsimLifecycleNotificationDelivery/);
  assert.match(schema, /eventKey\s+String\s+@unique/);
  assert.match(schema, /lifecycleUsageCheckedAt/);
  assert.match(schema, /model EsimLifecycleNotificationRunnerLock/);
  assert.match(migration, /EsimLifecycleNotificationDelivery/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "lifecycleUsageCheckedAt"/);
  assert.doesNotMatch(migration, /DROP COLUMN|DELETE FROM/i);
  console.log("   ok");

  console.log("2) V1 expiry triggers — timestamp only, no daysRemaining guess");
  assert.equal(ESIM_LIFECYCLE_EXPIRY_SOON_HOURS, 24);
  assert.equal(ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT, 10);
  assert.deepEqual(
    [...ESIM_LIFECYCLE_V1_ENABLED_KINDS],
    ["EXPIRY_SOON_24H", "EXPIRED"]
  );
  assert.equal(ESIM_LIFECYCLE_CRON_SCHEDULE_DAILY_UTC, "0 6 * * *");
  assert.equal(parseProviderInstantMs("not-a-date"), null);
  assert.equal(parseProviderInstantMs(""), null);

  const now = Date.parse("2026-08-27T12:00:00.000Z");
  const in12h = new Date(now + 12 * 3600_000).toISOString();
  const in24h = new Date(now + 24 * 3600_000).toISOString();
  const in36h = new Date(now + 36 * 3600_000).toISOString();
  const past = new Date(now - 3600_000).toISOString();

  assert.deepEqual(
    evaluateEsimLifecycleEvents(baseUsage({ expiresAt: in12h }), now),
    ["EXPIRY_SOON_24H"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleEvents(baseUsage({ expiresAt: in24h }), now),
    ["EXPIRY_SOON_24H"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleEvents(baseUsage({ expiresAt: in36h }), now),
    []
  );
  assert.deepEqual(
    evaluateEsimLifecycleEvents(baseUsage({ expiresAt: past }), now),
    ["EXPIRED"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleEvents(
      baseUsage({ isExpired: true, expiresAt: null }),
      now
    ),
    ["EXPIRED"]
  );
  // daysRemaining alone must NOT trigger V1 expiry-soon.
  assert.deepEqual(
    evaluateEsimLifecycleEvents(
      baseUsage({ daysRemaining: 1, expiresAt: null }),
      now
    ),
    []
  );
  assert.deepEqual(
    evaluateEsimLifecycleExpiryEvents(
      baseUsage({ daysRemaining: 1, expiresAt: null }),
      now
    ),
    []
  );
  // No expiry fields → no emails (never invent).
  assert.deepEqual(
    evaluateEsimLifecycleEvents(
      baseUsage({ expiresAt: null, daysRemaining: null, isExpired: null }),
      now
    ),
    []
  );
  // Expired takes precedence — never also EXPIRY_SOON.
  assert.deepEqual(
    evaluateEsimLifecycleExpiryEvents(
      baseUsage({ isExpired: true, expiresAt: in12h }),
      now
    ),
    ["EXPIRED"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleEvents(
      baseUsage({ isExpired: true, expiresAt: in12h }),
      now
    ),
    ["EXPIRED"]
  );
  assert.doesNotMatch(shared, /durationDays/);
  assert.match(shared, /Never invents expiry|Does not invent end dates/);
  assert.match(shared, /Does NOT use daysRemaining/);
  console.log("   ok");

  console.log("3) Data helpers exist but V1 delivery blocks them");
  assert.deepEqual(
    evaluateEsimLifecycleDataEvents(
      baseUsage({ remainingDataGB: 0.5, initialDataGB: 10 })
    ),
    ["LOW_DATA"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleDataEvents(
      baseUsage({ remainingDataGB: 0, initialDataGB: 10 })
    ),
    ["DATA_EXHAUSTED"]
  );
  // Runner entry point must not emit data kinds even if mixed into selection.
  assert.deepEqual(
    selectEsimLifecycleEventsForDelivery(
      ["LOW_DATA", "DATA_EXHAUSTED", "EXPIRY_SOON_24H"],
      ESIM_LIFECYCLE_V1_ENABLED_KINDS
    ),
    ["EXPIRY_SOON_24H"]
  );
  assert.deepEqual(
    selectEsimLifecycleEventsForDelivery(
      ["LOW_DATA", "DATA_EXHAUSTED"],
      ESIM_LIFECYCLE_V1_ENABLED_KINDS
    ),
    []
  );
  // Explicit future precedence: at most one event per pass when all enabled.
  assert.deepEqual(
    selectEsimLifecycleEventsForDelivery(
      ["LOW_DATA", "EXPIRY_SOON_24H", "DATA_EXHAUSTED", "EXPIRED"],
      ESIM_LIFECYCLE_DELIVERY_PRECEDENCE
    ),
    ["EXPIRED"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleEvents(
      baseUsage({
        remainingDataGB: 0,
        initialDataGB: 10,
        expiresAt: in12h,
      }),
      now
    ),
    ["EXPIRY_SOON_24H"]
  );
  assert.match(notify, /kind_disabled_v1|ESIM_LIFECYCLE_V1_ENABLED_KINDS/);
  assert.match(runner, /ESIM_LIFECYCLE_V1_ENABLED_KINDS/);
  assert.doesNotMatch(runner, /evaluateEsimLifecycleDataEvents/);
  console.log("   ok");

  console.log("4) Duplicate protection + partner exclusion wiring");
  assert.equal(
    buildEsimLifecycleEventKey("ord_1", "EXPIRED"),
    "esim_lifecycle:ord_1:EXPIRED"
  );
  assert.match(notify, /eventKey/);
  assert.match(notify, /updateMany/);
  assert.match(notify, /PARTNER_BALANCE/);
  assert.match(notify, /partnerEsimPurchase/);
  assert.match(notify, /Role\.PARTNER/);
  assert.match(notify, /channel:\s*"orders"/);
  assert.match(runner, /claimEsimLifecycleRunnerLock/);
  assert.match(runner, /fetchProviderUsage/);
  assert.match(runner, /normalizeProviderUsagePayload/);
  assert.match(runner, /evaluateEsimLifecycleEvents/);
  assert.match(runner, /partnerEsimPurchase:\s*null/);
  assert.match(runner, /PARTNER_BALANCE/);
  assert.doesNotMatch(runner, /createdAt \+ .*duration/);
  assert.match(runner, /Never invents expiry/);
  console.log("   ok");

  console.log("5) Daily Hobby-compatible cron (not hourly)");
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /runEsimLifecycleNotifications/);
  assert.match(cron, /unauthorized/);
  assert.match(cron, /Hobby|daily UTC/i);
  assert.match(vercel, /esim-lifecycle-notifications/);
  assert.match(vercel, /"0 6 \* \* \*"/);
  assert.doesNotMatch(vercel, /"15 \* \* \* \*"/);
  assert.equal(
    JSON.parse(vercel).crons.length,
    1,
    "Hobby: keep a single daily cron job"
  );
  console.log("   ok");

  console.log("6) Email template branding + CTAs");
  const payload = {
    kind: "EXPIRY_SOON_24H" as const,
    customerName: "Ada Lovelace",
    destinationLabel: "Asia",
    planLabel: "3 GB · 30 Days",
    expiryStatusLabel: "Expires in about 24 hours",
    expiryDateLabel: formatLifecycleExpiryLabel(in12h, now),
    remainingDataLabel: null,
    myEsimUrl: "https://mapesim.com/account/orders",
    buyAnotherUrl: "https://mapesim.com/countries",
  };
  const html = renderEsimLifecycleEmailHtml(payload);
  const text = renderEsimLifecycleEmailText(payload);
  assert.match(html, /Stay connected, wherever you go/);
  assert.match(html, /View My eSIM/);
  assert.match(html, /Buy another plan/);
  assert.match(html, /Asia/);
  assert.match(html, /3 GB · 30 Days/);
  assert.match(text, /View My eSIM/);
  assert.match(text, /Buy another plan/);
  assert.equal(
    lifecycleSubject("EXPIRED"),
    "Your MAP eSIM plan has expired"
  );
  assertNoSensitive(html);
  assertNoSensitive(text);
  assert.match(template, /renderTransactionalEmailLayoutHtml/);
  console.log("   ok");

  console.log("7) Isolation — payment / refund / rewards / partner untouched");
  assert.doesNotMatch(wallet, /esimLifecycleNotification/);
  assert.doesNotMatch(partner, /esimLifecycleNotification/);
  assert.doesNotMatch(refunds, /esimLifecycleNotification/);
  assert.doesNotMatch(rewards, /esimLifecycleNotification/);
  assert.match(usage, /normalizeProviderUsagePayload/);
  assert.match(pkg, /"qa:esim-lifecycle-notifications"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=esim-lifecycle-notifications");
}

main();
