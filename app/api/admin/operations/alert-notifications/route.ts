/**
 * Manual "Run alert notifications" for /admin/operations.
 * Hard per-step budgets so the function returns well before Vercel maxDuration.
 */
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { requireRole } from "@/app/lib/auth/session";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  ALERT_NOTIFICATION_AUTH_TIMEOUT_MS,
  ALERT_NOTIFICATION_CONFIRM_PHRASE,
  ALERT_NOTIFICATION_RUN_TIME_BUDGET_MS,
  emptyRunnerCounts,
  formatAlertNotificationFailureReason,
  formatAlertNotificationPartialProgress,
} from "@/app/lib/admin/alertNotificationShared";
import { evaluateAndDeliverAlertNotifications } from "@/app/lib/admin/alertNotificationRunner";
import { loadOperationalControlPausedMapSoft } from "@/app/lib/admin/operationalControlsPolicy";
import { parseOperationalConfirmPhrase } from "@/app/lib/admin/operationalControlsShared";
import { closeChannelTransporter } from "@/app/lib/email/transport";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Safety ceiling only — the handler itself budgets ~15s and returns JSON. */
export const maxDuration = 60;

/** Route-level hard ceiling (auth + run) — always respond before Vercel kill. */
const ROUTE_HARD_TIMEOUT_MS = 15_000;

function skippedCountFrom(counts: {
  suppressed: number;
  cooldown: number;
}): number {
  return counts.suppressed + counts.cooldown;
}

function checkpoint(step: string, extra?: Record<string, unknown>): void {
  console.info("[alert-run]", { step, ...(extra ?? {}) });
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  code: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorPayload(
  error: string,
  extra?: {
    aggregationMs?: number;
    sendMs?: number;
    processedCount?: number;
    remainingCount?: number;
    lastStep?: string;
  }
) {
  const counts = emptyRunnerCounts();
  return {
    ok: false as const,
    error,
    sentCount: 0,
    skippedCount: 0,
    remainingCount: extra?.remainingCount ?? 0,
    processedCount: extra?.processedCount ?? 0,
    aggregationMs: extra?.aggregationMs ?? 0,
    sendMs: extra?.sendMs ?? 0,
    lastStep: extra?.lastStep,
    counts,
  };
}

export async function POST(req: Request) {
  const routeStartedAt = Date.now();
  try {
    checkpoint("auth");
    let admin: { id: string };
    try {
      const sessionUser = await withTimeout(
        requireRole("ADMIN"),
        ALERT_NOTIFICATION_AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT"
      );
      await withTimeout(
        assertAdminPermission(sessionUser.id, "ALERTS_VIEW"),
        ALERT_NOTIFICATION_AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT"
      );
      const row = await withTimeout(
        prisma.user.findUnique({
          where: { id: sessionUser.id },
          select: {
            id: true,
            role: true,
            deletedAt: true,
            adminDisabledAt: true,
          },
        }),
        ALERT_NOTIFICATION_AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT"
      );
      if (
        !row ||
        row.deletedAt ||
        row.role !== Role.ADMIN ||
        row.adminDisabledAt
      ) {
        return NextResponse.json(
          errorPayload("Not authorized.", { lastStep: "auth" }),
          { status: 401 }
        );
      }
      admin = { id: row.id };
    } catch (error) {
      const timedOut =
        error instanceof Error && error.message === "AUTH_TIMEOUT";
      checkpoint(timedOut ? "auth_timeout" : "auth_failed");
      return NextResponse.json(
        errorPayload(
          timedOut
            ? "Auth/session check timed out. Try again shortly."
            : "Not authorized.",
          { lastStep: "auth_timeout" }
        ),
        { status: timedOut ? 504 : 401 }
      );
    }

    if (!(await assertSameOriginAdminRequest())) {
      return NextResponse.json(
        errorPayload("Request origin is not allowed.", {
          lastStep: "origin",
        }),
        { status: 403 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const phrase = String(body.confirmPhrase ?? "");
    const phraseCheck = parseOperationalConfirmPhrase(
      phrase,
      ALERT_NOTIFICATION_CONFIRM_PHRASE
    );
    if (!phraseCheck.ok) {
      return NextResponse.json(
        errorPayload(phraseCheck.error, { lastStep: "confirm" }),
        { status: 400 }
      );
    }

    const rate = consumeRateLimit({
      key: `alert-notify-run:${admin.id}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rate.ok) {
      return NextResponse.json(
        errorPayload("Too many notification runs. Try again shortly.", {
          lastStep: "rate_limit",
        }),
        { status: 429 }
      );
    }

    const controls = await loadOperationalControlPausedMapSoft();
    if (controls.map.ALERT_NOTIFICATIONS) {
      return NextResponse.json({
        ...errorPayload(
          formatAlertNotificationFailureReason({ errorCode: "paused" }),
          { lastStep: "paused" }
        ),
        paused: true,
      });
    }

    const remainingBudget = Math.max(
      1_000,
      Math.min(
        ALERT_NOTIFICATION_RUN_TIME_BUDGET_MS + 2_000,
        ROUTE_HARD_TIMEOUT_MS - (Date.now() - routeStartedAt)
      )
    );

    checkpoint("run_start", { remainingBudget });
    let result: Awaited<ReturnType<typeof evaluateAndDeliverAlertNotifications>>;
    try {
      result = await withTimeout(
        evaluateAndDeliverAlertNotifications(),
        remainingBudget,
        "ROUTE_RUN_TIMEOUT"
      );
    } catch (error) {
      closeChannelTransporter("support");
      const timedOut =
        error instanceof Error && error.message === "ROUTE_RUN_TIMEOUT";
      checkpoint(timedOut ? "run_timeout" : "run_failed");
      return NextResponse.json(
        errorPayload(
          timedOut
            ? "Alert notification run stopped after the server time budget. Click again to continue."
            : "Unable to run alert notifications. Please try again.",
          { lastStep: timedOut ? "run_timeout" : "run_failed" }
        ),
        { status: timedOut ? 504 : 500 }
      );
    }

    // Best-effort path revalidation — never block the JSON response on cache work.
    void Promise.resolve()
      .then(() => {
        revalidatePath("/admin/operations");
        revalidatePath("/admin/alerts");
      })
      .catch(() => undefined);

    const counts = result.counts;
    const progressMessage =
      formatAlertNotificationPartialProgress({
        processed: result.processed,
        remaining: counts.remaining,
      }) ?? undefined;

    checkpoint("done", {
      ok: result.ok,
      processed: result.processed,
      aggregationMs: result.aggregationMs,
      sendMs: result.sendMs,
      elapsedMs: Date.now() - routeStartedAt,
    });

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: formatAlertNotificationFailureReason({
          errorCode: result.errorCode,
          detail: result.errorDetail,
        }),
        sentCount: counts.sent,
        skippedCount: skippedCountFrom(counts),
        remainingCount: counts.remaining,
        processedCount: result.processed,
        aggregationMs: result.aggregationMs,
        sendMs: result.sendMs,
        lastStep: result.lastStep,
        progressMessage,
        counts,
        paused: result.paused,
        snapshotComplete: result.snapshotComplete,
      });
    }

    return NextResponse.json({
      ok: true,
      sentCount: counts.sent,
      skippedCount: skippedCountFrom(counts),
      remainingCount: counts.remaining,
      processedCount: result.processed,
      aggregationMs: result.aggregationMs,
      sendMs: result.sendMs,
      lastStep: result.lastStep,
      progressMessage,
      counts,
      paused: result.paused,
      snapshotComplete: result.snapshotComplete,
    });
  } catch (error) {
    closeChannelTransporter("support");
    console.error(
      "alert_notification_run",
      "UNHANDLED",
      error instanceof Error ? error.message.slice(0, 80) : "unknown"
    );
    checkpoint("unhandled");
    return NextResponse.json(
      errorPayload("Unable to run alert notifications. Please try again.", {
        lastStep: "unhandled",
      }),
      { status: 500 }
    );
  }
}
