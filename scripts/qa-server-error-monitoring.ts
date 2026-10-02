/**
 * Offline QA: custom zero-dependency Sentry transport + wiring (no real DSN/secrets).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildSentryStoreEvent,
  clipMonitoringText,
  EXPECTED_BUSINESS_ERROR_CODES,
  isExpectedBusinessMonitoringError,
  isMonitoringFlagEnabled,
  normalizeSampleRate,
  parseSentryDsn,
  postSentryStoreEvent,
  sanitizeMonitoringExtras,
  sanitizeMonitoringTags,
  SENTRY_MESSAGE_MAX,
  SENTRY_REPORT_TIMEOUT_MS,
} from "../app/lib/monitoring/serverErrorMonitoringShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function gitDiff(rel: string): string {
  try {
    return execFileSync("git", ["diff", "--", rel], {
      cwd: root,
      encoding: "utf8",
    });
  } catch {
    return "GIT_DIFF_UNAVAILABLE";
  }
}

async function main() {
  const monPath = "app/lib/monitoring/serverErrorMonitoring.ts";
  const sharedPath = "app/lib/monitoring/serverErrorMonitoringShared.ts";
  const instrPath = "instrumentation.ts";
  assert.ok(existsSync(join(root, monPath)));
  assert.ok(existsSync(join(root, sharedPath)));
  assert.ok(existsSync(join(root, instrPath)));

  const mon = read(monPath);
  const shared = read(sharedPath);
  const instr = read(instrPath);
  const pkg = read("package.json");

  console.log("1) Initialization + env-driven config (no hardcoded DSN)");
  assert.match(instr, /initServerErrorMonitoring/);
  assert.match(instr, /onRequestError/);
  assert.match(instr, /reportServerErrorAsync/);
  assert.match(instr, /await reportServerErrorAsync/);
  assert.match(instr, /NEXT_RUNTIME/);
  assert.match(mon, /SENTRY_DSN/);
  assert.match(mon, /SENTRY_ENVIRONMENT|VERCEL_ENV/);
  assert.match(mon, /SENTRY_RELEASE|VERCEL_GIT_COMMIT_SHA/);
  assert.match(mon, /SENTRY_REPORT_TIMEOUT_MS|timeoutMs|AbortController/);
  assert.match(mon, /from ["']next\/server["']/);
  assert.match(mon, /\bafter\s*\(/);
  assert.doesNotMatch(mon, /while\s*\(|for\s*\(\s*;;\s*\)/);
  assert.doesNotMatch(shared + mon + instr, /https:\/\/[a-z0-9]+@o\d+/i);
  assert.doesNotMatch(mon, /dsn:\s*["']https?:\/\//i);
  console.log("   ok");

  console.log("2) DSN parse + Store URL construction");
  const valid = parseSentryDsn(
    "https://public_test_key@o000000.ingest.sentry.io/123456"
  );
  assert.ok(valid);
  assert.equal(valid!.publicKey, "public_test_key");
  assert.equal(valid!.projectId, "123456");
  assert.equal(valid!.host, "o000000.ingest.sentry.io");
  assert.equal(
    valid!.storeUrl,
    "https://o000000.ingest.sentry.io/api/123456/store/"
  );
  assert.equal(parseSentryDsn(""), null);
  assert.equal(parseSentryDsn("not-a-dsn"), null);
  assert.equal(parseSentryDsn("https://@host/1"), null);
  assert.equal(parseSentryDsn("https://key@host/"), null);
  assert.equal(parseSentryDsn("https://key@host/abc"), null); // project must be digits
  console.log("   ok");

  console.log("3) Release/environment on event when configured");
  const event = buildSentryStoreEvent({
    eventId: "a".repeat(32),
    error: { name: "Error", message: "boom" },
    context: { operation: "monitoring_unit_test" },
    environment: "preview",
    release: "gitsha_test_only",
    nowMs: 1_700_000_000_000,
  });
  assert.equal(event.environment, "preview");
  assert.equal(event.release, "gitsha_test_only");
  assert.equal(event.platform, "node");
  console.log("   ok");

  console.log("4) Sensitive context keys removed + secret fragments scrubbed");
  const tags = sanitizeMonitoringTags({
    operation: "unit",
    errorCode: "PROVIDER_FAILED",
    extras: undefined,
  });
  assert.equal(tags.operation, "unit");
  const extras = sanitizeMonitoringExtras({
    operation: "unit",
    purchaseId: "p_ok",
    extras: {
      authorization: "Bearer secret-token",
      cookie: "session=abc",
      password: "x",
      api_key: "k",
      webhook_secret: "w",
      signature: "sig",
      msisdn: "923001234567",
      userKey: "uk",
      raw_body: "{}",
      webhook_body: "{}",
      card: "4111",
      safeNote: "ok",
    },
  });
  assert.equal(extras.purchaseId, "p_ok");
  assert.equal(extras.safeNote, "ok");
  assert.equal(extras.authorization, undefined);
  assert.equal(extras.cookie, undefined);
  assert.equal(extras.password, undefined);
  assert.equal(extras.api_key, undefined);
  assert.equal(extras.webhook_secret, undefined);
  assert.equal(extras.signature, undefined);
  assert.equal(extras.msisdn, undefined);
  assert.equal(extras.userKey, undefined);
  assert.equal(extras.raw_body, undefined);
  assert.equal(extras.webhook_body, undefined);
  assert.equal(extras.card, undefined);
  assert.equal(clipMonitoringText("authorization: Bearer abc.def"), "[redacted]");
  assert.equal(clipMonitoringText("timeout password=supersecret detail"), "[redacted]");
  // Key=value form without sensitive substring-key combo still scrubbed by replace path:
  assert.match(
    clipMonitoringText("request failed api_key=abcd1234 later") ?? "",
    /\[redacted\]/
  );
  assert.match(shared, /SENSITIVE_KEY/);
  assert.match(shared, /webhook.?body|raw.?body|signature|authorization|password|token|msisdn|userKey/i);
  assert.doesNotMatch(mon, /rawBody\s*:/);
  assert.doesNotMatch(mon, /headers:\s*request\.headers/);
  console.log("   ok");

  console.log("5) Oversized messages clipped");
  const long = "x".repeat(SENTRY_MESSAGE_MAX + 50);
  const clipped = clipMonitoringText(long);
  assert.ok(clipped);
  assert.ok(clipped!.length <= SENTRY_MESSAGE_MAX + 1);
  assert.ok(clipped!.endsWith("…"));
  console.log("   ok");

  console.log("6) Network timeout / failure / HTTP 4xx/5xx swallowed");
  assert.ok(SENTRY_REPORT_TIMEOUT_MS > 0 && SENTRY_REPORT_TIMEOUT_MS <= 10_000);

  const timedOut = await postSentryStoreEvent({
    storeUrl: "https://example.invalid/api/1/store/",
    publicKey: "k",
    eventBody: { event_id: "b".repeat(32) },
    timeoutMs: 30,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      }),
  });
  assert.equal(timedOut, "failed");

  const networkFail = await postSentryStoreEvent({
    storeUrl: "https://example.invalid/api/1/store/",
    publicKey: "k",
    eventBody: { event_id: "c".repeat(32) },
    fetchImpl: async () => {
      throw new Error("ENOTFOUND");
    },
  });
  assert.equal(networkFail, "failed");

  const http500 = await postSentryStoreEvent({
    storeUrl: "https://example.invalid/api/1/store/",
    publicKey: "k",
    eventBody: { event_id: "d".repeat(32) },
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  assert.equal(http500, "failed");

  const http400 = await postSentryStoreEvent({
    storeUrl: "https://example.invalid/api/1/store/",
    publicKey: "k",
    eventBody: { event_id: "e".repeat(32) },
    fetchImpl: async () => ({ ok: false, status: 400 }),
  });
  assert.equal(http400, "failed");

  const httpOk = await postSentryStoreEvent({
    storeUrl: "https://example.invalid/api/1/store/",
    publicKey: "k",
    eventBody: { event_id: "f".repeat(32) },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(httpOk, "sent");
  console.log("   ok");

  console.log("7) SENTRY_ENABLED=false disables; sample rate boundaries safe");
  assert.equal(
    isMonitoringFlagEnabled({ sentryEnabled: "false", nodeEnv: "production" }),
    false
  );
  assert.equal(
    isMonitoringFlagEnabled({ sentryEnabled: "0", nodeEnv: "production" }),
    false
  );
  assert.equal(
    isMonitoringFlagEnabled({ sentryEnabled: "true", nodeEnv: "development" }),
    true
  );
  assert.equal(
    isMonitoringFlagEnabled({ sentryEnabled: "", nodeEnv: "production" }),
    true
  );
  assert.equal(
    isMonitoringFlagEnabled({ sentryEnabled: "", nodeEnv: "development" }),
    false
  );
  assert.equal(normalizeSampleRate("1"), 1);
  assert.equal(normalizeSampleRate("0"), 0);
  assert.equal(normalizeSampleRate("-5"), 0);
  assert.equal(normalizeSampleRate("9"), 1);
  assert.equal(normalizeSampleRate("nope"), 1);
  assert.equal(normalizeSampleRate("0.5"), 0.5);
  console.log("   ok");

  console.log("8) Expected business errors filtered (partner_buy noise)");
  for (const code of EXPECTED_BUSINESS_ERROR_CODES) {
    assert.equal(
      isExpectedBusinessMonitoringError({ code }, { errorCode: code }),
      true,
      code
    );
  }
  assert.equal(
    isExpectedBusinessMonitoringError(
      { code: "INSUFFICIENT_FUNDS" },
      { errorCode: "INSUFFICIENT_FUNDS" }
    ),
    true
  );
  assert.equal(
    isExpectedBusinessMonitoringError(
      { code: "PROVIDER_FAILED" },
      { errorCode: "PROVIDER_FAILED" }
    ),
    false
  );
  assert.equal(
    isExpectedBusinessMonitoringError(new Error("db down"), {}),
    false
  );
  assert.match(mon, /isExpectedBusinessMonitoringError/);
  console.log("   ok");

  console.log("9) Critical server failure paths call reportServerError");
  const paths = [
    "app/lib/partner/partnerPurchaseBuy.ts",
    "app/lib/partner/partnerEsimPurchase.ts",
    "app/lib/partner/partnerEsimPurchaseProvider.ts",
    "app/lib/partner/partnerEsimPurchaseGatewayCheckout.ts",
    "app/lib/admin/staleGatewayReservationRelease.ts",
    "app/lib/payments/simpaisaAdapter.ts",
    "app/lib/payments/simpaisaHttp.ts",
    "app/lib/admin/reconciliationLocalFinalization.ts",
  ];
  for (const rel of paths) {
    const src = read(rel);
    assert.match(src, /reportServerError|reportServerFailure/, rel);
    // Business catch paths must not await the sync reporter (after-scheduled).
    assert.doesNotMatch(src, /await reportServerError\(/, rel);
  }
  const cronPaths = [
    "app/api/cron/gateway-stale-reservation-release/route.ts",
    "app/api/cron/esim-lifecycle-notifications/route.ts",
    "app/api/cron/customer-esim-gateway-stale-release/route.ts",
    "app/api/cron/partner-esim-gateway-stale-release/route.ts",
    "app/api/cron/abandoned-checkout-recovery/route.ts",
  ];
  for (const rel of cronPaths) {
    const src = read(rel);
    assert.match(src, /await reportServerErrorAsync/, rel);
  }
  console.log("   ok");

  console.log("10) Isolation + serverless delivery primitives");
  assert.match(mon, /reportServerErrorAsync/);
  assert.match(mon, /scheduleServerErrorDelivery|after\(/);
  assert.match(mon, /catch\s*\{/);
  assert.match(shared, /SENTRY_REPORT_TIMEOUT_MS/);
  assert.doesNotMatch(read("tsconfig.json"), /"tmp"/);
  console.log("   ok");

  console.log("11) No financial/schema/business logic package changes in this slice");
  assert.equal(gitDiff("prisma/schema.prisma").trim(), "", "prisma");
  assert.equal(gitDiff("app/lib/partner/partnerWallet.ts").trim(), "", "partnerWallet");
  assert.equal(
    gitDiff("app/lib/partner/partnerPurchaseWallet.ts").trim(),
    "",
    "partnerPurchaseWallet"
  );
  assert.equal(gitDiff("tsconfig.json").trim(), "", "tsconfig must be unchanged");
  assert.match(pkg, /qa:server-error-monitoring/);
  assert.doesNotMatch(mon, /@sentry\/nextjs|@sentry\/react|replayIntegration|browserTracingIntegration/);
  assert.doesNotMatch(instr, /@sentry\/nextjs|Replay|browserTracing/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=server-error-monitoring");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
