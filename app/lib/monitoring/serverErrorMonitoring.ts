import "server-only";

import { randomUUID } from "crypto";
import { after } from "next/server";

import {
  buildSentryStoreEvent,
  clipMonitoringText,
  extractErrorCode,
  isExpectedBusinessMonitoringError,
  isMonitoringFlagEnabled,
  normalizeSampleRate,
  parseSentryDsn,
  postSentryStoreEvent,
  SENTRY_REPORT_TIMEOUT_MS,
  type ParsedSentryDsn,
  type SentryFetch,
  type ServerErrorContext,
} from "@/app/lib/monitoring/serverErrorMonitoringShared";

export type { ServerErrorContext };

type MonitoringRuntime = {
  enabled: boolean;
  dsn: ParsedSentryDsn | null;
  environment: string;
  release: string | null;
  sampleRate: number;
};

type DeliverDeps = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

let runtime: MonitoringRuntime | null = null;
const reportedErrors = new WeakSet<object>();

function readRuntime(): MonitoringRuntime {
  if (runtime) return runtime;

  const enabled = isMonitoringFlagEnabled({
    sentryEnabled: process.env.SENTRY_ENABLED,
    nodeEnv: process.env.NODE_ENV,
  });
  const dsn = parseSentryDsn(process.env.SENTRY_DSN ?? "");
  const environment =
    (process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development")
      .trim()
      .slice(0, 64) || "development";
  const release =
    (process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "")
      .trim()
      .slice(0, 100) || null;
  const sampleRate = normalizeSampleRate(process.env.SENTRY_SAMPLE_RATE);

  runtime = {
    enabled: enabled && Boolean(dsn),
    dsn,
    environment,
    release,
    sampleRate,
  };
  return runtime;
}

/** Warm env parse / cache — safe no-op when DSN missing/malformed. */
export function initServerErrorMonitoring(): void {
  try {
    readRuntime();
  } catch {
    // never throw during boot
  }
}

/** Test-only: clear cached runtime. */
export function __resetServerErrorMonitoringForTests(): void {
  runtime = null;
}

export function isServerErrorMonitoringConfigured(): boolean {
  return Boolean(parseSentryDsn(process.env.SENTRY_DSN ?? ""));
}

function shouldSend(cfg: MonitoringRuntime): boolean {
  if (!cfg.enabled || !cfg.dsn) return false;
  if (cfg.sampleRate <= 0) return false;
  if (cfg.sampleRate >= 1) return true;
  return Math.random() < cfg.sampleRate;
}

function toErrorParts(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: clipMonitoringText(error.name, 80) ?? "Error",
      message: clipMonitoringText(error.message) ?? "Unknown error",
      stack: error.stack ? clipMonitoringText(error.stack, 4000) : undefined,
    };
  }
  return {
    name: "Error",
    message: clipMonitoringText(error) ?? "Unknown error",
  };
}

/**
 * Deliver one event to Sentry Store API.
 * NEVER throws. Network/DNS/timeout/non-2xx are swallowed.
 * Single attempt — no retry loop.
 */
export async function deliverServerErrorToSentry(
  error: unknown,
  context: ServerErrorContext,
  deps: DeliverDeps = {}
): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (isExpectedBusinessMonitoringError(error, context)) {
      return "skipped";
    }

    const cfg = readRuntime();
    if (!shouldSend(cfg) || !cfg.dsn) return "skipped";

    if (error && typeof error === "object") {
      if (reportedErrors.has(error as object)) return "skipped";
      reportedErrors.add(error as object);
    }

    const parts = toErrorParts(error);
    const eventId = randomUUID().replace(/-/g, "");
    const body = buildSentryStoreEvent({
      eventId,
      error: parts,
      context: {
        ...context,
        errorCode: context.errorCode ?? extractErrorCode(error) ?? null,
      },
      environment: cfg.environment,
      release: cfg.release,
    });

    const result = await postSentryStoreEvent({
      storeUrl: cfg.dsn.storeUrl,
      publicKey: cfg.dsn.publicKey,
      eventBody: body,
      fetchImpl: deps.fetchImpl
        ? (deps.fetchImpl as unknown as SentryFetch)
        : undefined,
      timeoutMs: deps.timeoutMs ?? SENTRY_REPORT_TIMEOUT_MS,
    });
    return result;
  } catch {
    // DNS/network/timeout/abort/malformed runtime — silent no-op.
    return "failed";
  }
}

/**
 * Schedule delivery with Next.js `after` so Vercel keeps the isolate alive
 * after the response (same pattern as public offer snapshot refresh).
 * Falls back to bounded await when `after` is unavailable (no request scope).
 * NEVER throws into the caller. Never changes business outcomes.
 */
function scheduleServerErrorDelivery(
  error: unknown,
  context: ServerErrorContext
): void {
  const run = () =>
    deliverServerErrorToSentry(error, context).then(
      () => undefined,
      () => undefined
    );

  try {
    after(run);
    return;
  } catch {
    // Outside a Next request/call lifetime (scripts/tests).
  }

  // No bare untracked fire-and-forget in serverless request paths — that is
  // handled by `after` above. Here we cannot block a sync API forever; start
  // delivery and rely on callers that need hard flush to use reportServerErrorAsync.
  void run();
}

/**
 * Non-blocking reporter for payment/provider/admin catch paths.
 * Uses Next.js `after` for reliable serverless flush without changing
 * return/throw semantics. NEVER throws into the caller.
 */
export function reportServerError(error: unknown, context: ServerErrorContext): void {
  try {
    scheduleServerErrorDelivery(error, context);
  } catch {
    // Isolation guarantee — reporter must never throw into caller.
  }
}

/**
 * Awaitable reporter — use for:
 * - Next.js `onRequestError` (must await async reporting work)
 * - Cron handlers (flush before invocation completes)
 * Still never throws; timeout remains bounded inside deliver.
 */
export async function reportServerErrorAsync(
  error: unknown,
  context: ServerErrorContext
): Promise<void> {
  try {
    await deliverServerErrorToSentry(error, context);
  } catch {
    // Isolation guarantee.
  }
}

export function reportServerFailure(
  message: string,
  context: ServerErrorContext & { errorCode?: string | null }
): void {
  reportServerError(new Error(message), context);
}

export async function reportServerFailureAsync(
  message: string,
  context: ServerErrorContext & { errorCode?: string | null }
): Promise<void> {
  await reportServerErrorAsync(new Error(message), context);
}
