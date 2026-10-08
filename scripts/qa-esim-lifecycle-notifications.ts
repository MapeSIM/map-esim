/**
 * Offline QA for customer eSIM lifecycle (expiry + usage) notifications.
 * Does not call VeSIM, mutate orders, or send SMTP mail.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildEsimLifecycleAddDataUrl,
  buildEsimLifecycleBrowseDestinationsUrl,
  buildEsimLifecycleOrderUrl,
  renderEsimLifecycleEmailHtml,
  renderEsimLifecycleEmailText,
  resolveEsimLifecyclePrimaryCta,
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
  scoreEsimLifecycleCandidatePriority,
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
  const adminUsage = read("app/lib/orders/adminEsimUsage.ts");
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

  console.log("2) Expiry triggers — timestamp only, no daysRemaining guess");
  assert.equal(ESIM_LIFECYCLE_EXPIRY_SOON_HOURS, 24);
  assert.equal(ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT, 20);
  assert.deepEqual(
    [...ESIM_LIFECYCLE_V1_ENABLED_KINDS],
    ["EXPIRY_SOON_24H", "EXPIRED", "LOW_DATA", "DATA_EXHAUSTED"]
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
  // daysRemaining alone must NOT trigger expiry-soon.
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
  // No expiry fields and healthy remaining → no emails (never invent).
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

  console.log("3) Data alerts enabled — ≤20% remaining + depleted");
  // 20% remaining (2/10) → LOW_DATA; 21% remaining stays quiet.
  assert.deepEqual(
    evaluateEsimLifecycleDataEvents(
      baseUsage({ remainingDataGB: 2, initialDataGB: 10 })
    ),
    ["LOW_DATA"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleDataEvents(
      baseUsage({ remainingDataGB: 2.1, initialDataGB: 10 })
    ),
    []
  );
  // Legacy 10% fixture still qualifies under the 20% threshold.
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
  assert.deepEqual(
    selectEsimLifecycleEventsForDelivery(
      ["LOW_DATA", "DATA_EXHAUSTED", "EXPIRY_SOON_24H"],
      ESIM_LIFECYCLE_V1_ENABLED_KINDS
    ),
    ["EXPIRY_SOON_24H", "DATA_EXHAUSTED", "LOW_DATA"]
  );
  assert.deepEqual(
    selectEsimLifecycleEventsForDelivery(
      ["LOW_DATA", "DATA_EXHAUSTED"],
      ESIM_LIFECYCLE_V1_ENABLED_KINDS
    ),
    ["DATA_EXHAUSTED", "LOW_DATA"]
  );
  // Explicit precedence: at most ordered delivery list when all enabled.
  assert.deepEqual(
    selectEsimLifecycleEventsForDelivery(
      ["LOW_DATA", "EXPIRY_SOON_24H", "DATA_EXHAUSTED", "EXPIRED"],
      ESIM_LIFECYCLE_DELIVERY_PRECEDENCE
    ),
    ["EXPIRED", "EXPIRY_SOON_24H", "DATA_EXHAUSTED", "LOW_DATA"]
  );
  // Combined entry returns expiry-soon + depleted when both due.
  assert.deepEqual(
    evaluateEsimLifecycleEvents(
      baseUsage({
        remainingDataGB: 0,
        initialDataGB: 10,
        expiresAt: in12h,
      }),
      now
    ),
    ["EXPIRY_SOON_24H", "DATA_EXHAUSTED"]
  );
  assert.deepEqual(
    evaluateEsimLifecycleEvents(
      baseUsage({
        remainingDataGB: 1.5,
        initialDataGB: 10,
        expiresAt: null,
      }),
      now
    ),
    ["LOW_DATA"]
  );
  assert.match(notify, /kind_disabled_v1|ESIM_LIFECYCLE_V1_ENABLED_KINDS/);
  assert.match(runner, /ESIM_LIFECYCLE_V1_ENABLED_KINDS/);
  assert.match(runner, /evaluateEsimLifecycleEvents/);
  assert.match(runner, /scoreEsimLifecycleCandidatePriority/);
  assert.match(shared, /evaluateEsimLifecycleDataEvents/);
  assert.match(shared, /ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT = 20/);
  console.log("   ok");

  console.log("4) Duplicate protection + partner exclusion + priority scoring");
  assert.equal(
    buildEsimLifecycleEventKey("ord_1", "EXPIRED"),
    "esim_lifecycle:ord_1:EXPIRED"
  );
  assert.ok(
    scoreEsimLifecycleCandidatePriority({
      nowMs: now,
      providerExpiresAtMs: now + 12 * 3600_000,
      providerLifecycleStatus: null,
      remainingDataGB: null,
      initialDataGB: null,
      lifecycleUsageCheckedAtMs: null,
    }) >
      scoreEsimLifecycleCandidatePriority({
        nowMs: now,
        providerExpiresAtMs: null,
        providerLifecycleStatus: null,
        remainingDataGB: 5,
        initialDataGB: 10,
        lifecycleUsageCheckedAtMs: now,
      })
  );
  assert.ok(
    scoreEsimLifecycleCandidatePriority({
      nowMs: now,
      providerExpiresAtMs: null,
      providerLifecycleStatus: "DEPLETED",
      remainingDataGB: 0,
      initialDataGB: 10,
      lifecycleUsageCheckedAtMs: now,
    }) >
      scoreEsimLifecycleCandidatePriority({
        nowMs: now,
        providerExpiresAtMs: null,
        providerLifecycleStatus: null,
        remainingDataGB: 5,
        initialDataGB: 10,
        lifecycleUsageCheckedAtMs: now,
      })
  );
  assert.match(notify, /eventKey/);
  assert.match(notify, /updateMany/);
  assert.match(notify, /PARTNER_BALANCE/);
  assert.match(notify, /partnerEsimPurchase/);
  assert.match(notify, /Role\.PARTNER/);
  assert.match(notify, /channel:\s*"orders"/);
  assert.match(notify, /maybeDeliverEsimLifecycleNotificationsFromUsage/);
  assert.match(runner, /claimEsimLifecycleRunnerLock/);
  assert.match(runner, /forceClearEsimLifecycleRunnerLock/);
  assert.match(runner, /claimedAt: \{ lte: staleBefore \}|staleBefore/);
  assert.match(runner, /finally \{/);
  assert.match(shared, /ESIM_LIFECYCLE_BATCH_SIZE = 2/);
  assert.match(shared, /ESIM_LIFECYCLE_PROCESS_CONCURRENCY = 3/);
  assert.match(shared, /ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(runner, /mapSettledWithConcurrency/);
  assert.match(runner, /ESIM_LIFECYCLE_PROCESS_CONCURRENCY/);
  assert.match(cron, /force=1|unlock=1|forceClearEsimLifecycleRunnerLock/);
  assert.match(cron, /lockForceCleared/);
  assert.match(cron, /mode:\s*"force_unlock"|force_unlock/);
  assert.match(cron, /staleRelease|skipped:\s*true/);
  assert.match(cron, /get\("staleRelease"\) !== "0"/);
  assert.match(cron, /runGatewayStaleReservationRecovery/);
  assert.match(cron, /piggyback stale unpaid gateway hold release/i);
  assert.match(cron, /fullWallet:\s*staleRelease\.fullWallet\.counts/);
  assert.match(
    cron,
    /partnerFullWallet:\s*staleRelease\.partnerFullWallet\.counts/
  );
  assert.match(runner, /fetchProviderUsage/);
  assert.match(runner, /normalizeProviderUsagePayload/);
  assert.match(runner, /evaluateEsimLifecycleEvents/);
  assert.match(runner, /partnerEsimPurchase:\s*null/);
  assert.match(runner, /PARTNER_BALANCE/);
  assert.doesNotMatch(runner, /createdAt \+ .*duration/);
  assert.match(runner, /Never invents[\s\S]*expiry|never invents expiry/i);
  console.log("   ok");

  console.log("5) Daily Hobby-compatible cron (not hourly)");
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /raw\.length >= 16/);
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
  const abandonedCron = read(
    "app/api/cron/abandoned-checkout-recovery/route.ts"
  );
  assert.match(abandonedCron, /CRON_SECRET/);
  assert.match(abandonedCron, /raw\.length >= 16/);
  assert.match(abandonedCron, /Not registered in vercel\.json/);
  const envExample = read(".env.example");
  assert.match(envExample, /CRON_SECRET=/);
  assert.match(envExample, /at least 16 characters/i);
  console.log("   ok");

  console.log("6) Email template branding + order-bound CTAs + low-data copy");
  const sampleOrderId = "ord_abc12345";
  const expiryCta = resolveEsimLifecyclePrimaryCta({
    kind: "EXPIRY_SOON_24H",
    orderId: sampleOrderId,
  });
  assert.equal(expiryCta.label, "Manage My eSIM");
  assert.equal(expiryCta.url, buildEsimLifecycleOrderUrl(sampleOrderId));
  assert.match(expiryCta.url, /\/account\/orders\/ord_abc12345$/);

  const lowDataCta = resolveEsimLifecyclePrimaryCta({
    kind: "LOW_DATA",
    orderId: sampleOrderId,
    addDataApplicable: true,
  });
  assert.equal(lowDataCta.label, "Add More Data");
  assert.equal(lowDataCta.url, buildEsimLifecycleAddDataUrl(sampleOrderId));
  assert.match(lowDataCta.url, /\/account\/orders\/ord_abc12345\/add-data$/);

  const depletedFallback = resolveEsimLifecyclePrimaryCta({
    kind: "DATA_EXHAUSTED",
    orderId: sampleOrderId,
    addDataApplicable: false,
  });
  assert.equal(depletedFallback.label, "Manage My eSIM");
  assert.equal(depletedFallback.url, buildEsimLifecycleOrderUrl(sampleOrderId));

  const payload = {
    kind: "EXPIRY_SOON_24H" as const,
    customerName: "Ada Lovelace",
    destinationLabel: "Asia",
    planLabel: "3 GB · 30 Days",
    expiryStatusLabel: "Expires in about 24 hours",
    expiryDateLabel: formatLifecycleExpiryLabel(in12h, now),
    remainingDataLabel: null,
    primaryCtaUrl: expiryCta.url,
    primaryCtaLabel: expiryCta.label,
    browseDestinationsUrl: buildEsimLifecycleBrowseDestinationsUrl(),
  };
  const html = renderEsimLifecycleEmailHtml(payload);
  const text = renderEsimLifecycleEmailText(payload);
  assert.match(html, /Stay connected, wherever you go/);
  assert.match(html, /Manage My eSIM/);
  assert.match(html, /Browse All Destinations/);
  assert.match(html, /\/account\/orders\/ord_abc12345/);
  assert.match(html, /Asia/);
  assert.match(html, /3 GB · 30 Days/);
  assert.match(text, /Manage My eSIM/);
  assert.match(text, /Browse All Destinations/);
  assert.doesNotMatch(html, /View My eSIM|Buy another plan/);
  assert.doesNotMatch(text, /View My eSIM|Buy another plan/);

  const dataPayload = {
    kind: "LOW_DATA" as const,
    customerName: "Ada Lovelace",
    destinationLabel: "Asia",
    planLabel: "3 GB · 30 Days",
    expiryStatusLabel: "Low data remaining (≤20%)",
    expiryDateLabel: null,
    remainingDataLabel: "2 GB of 10 GB",
    primaryCtaUrl: lowDataCta.url,
    primaryCtaLabel: lowDataCta.label,
    browseDestinationsUrl: buildEsimLifecycleBrowseDestinationsUrl(),
  };
  const dataHtml = renderEsimLifecycleEmailHtml(dataPayload);
  assert.match(dataHtml, /Add More Data/);
  assert.match(dataHtml, /\/account\/orders\/ord_abc12345\/add-data/);
  assert.match(dataHtml, /Browse All Destinations/);
  assert.match(dataHtml, /2 GB of 10 GB/);

  assert.equal(
    lifecycleSubject("EXPIRED"),
    "Your MAP eSIM plan has expired"
  );
  assert.match(template, /20% or less data remaining/);
  assert.match(template, /about 80% used/);
  assert.match(template, /resolveEsimLifecyclePrimaryCta/);
  assert.match(template, /Add More Data/);
  assert.match(template, /Manage My eSIM/);
  assert.match(template, /Browse All Destinations/);
  assert.match(notify, /resolveEsimLifecyclePrimaryCta/);
  assert.match(notify, /addDataApplicable/);
  assertNoSensitive(html);
  assertNoSensitive(text);
  assertNoSensitive(dataHtml);
  assert.match(template, /renderTransactionalEmailLayoutHtml/);
  console.log("   ok");

  console.log("7) Isolation + on-demand refresh wiring");
  assert.doesNotMatch(wallet, /esimLifecycleNotification/);
  assert.doesNotMatch(partner, /esimLifecycleNotification/);
  assert.doesNotMatch(refunds, /esimLifecycleNotification/);
  assert.doesNotMatch(rewards, /esimLifecycleNotification/);
  assert.match(usage, /normalizeProviderUsagePayload/);
  assert.match(usage, /maybeDeliverEsimLifecycleNotificationsFromUsage/);
  assert.match(adminUsage, /maybeDeliverEsimLifecycleNotificationsFromUsage/);
  assert.match(pkg, /"qa:esim-lifecycle-notifications"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=esim-lifecycle-notifications");
}

main();
