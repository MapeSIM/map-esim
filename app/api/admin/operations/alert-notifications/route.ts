/**
 * Manual "Run alert notifications" for /admin/operations.
 * Isolated route so Vercel maxDuration applies (default serverless limit is 10s).
 */
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { requireRole } from "@/app/lib/auth/session";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  ALERT_NOTIFICATION_CONFIRM_PHRASE,
  emptyRunnerCounts,
  formatAlertNotificationFailureReason,
  formatAlertNotificationPartialProgress,
} from "@/app/lib/admin/alertNotificationShared";
import { evaluateAndDeliverAlertNotifications } from "@/app/lib/admin/alertNotificationRunner";
import { loadOperationalControlPausedMapSoft } from "@/app/lib/admin/operationalControlsPolicy";
import { parseOperationalConfirmPhrase } from "@/app/lib/admin/operationalControlsShared";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function skippedCountFrom(counts: {
  suppressed: number;
  cooldown: number;
}): number {
  return counts.suppressed + counts.cooldown;
}

export async function POST(req: Request) {
  try {
    const sessionUser = await requireRole("ADMIN");
    await assertAdminPermission(sessionUser.id, "ALERTS_VIEW");
    const admin = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
    });
    if (
      !admin ||
      admin.deletedAt ||
      admin.role !== Role.ADMIN ||
      admin.adminDisabledAt
    ) {
      return NextResponse.json(
        { ok: false, error: "Not authorized." },
        { status: 401 }
      );
    }

    if (!(await assertSameOriginAdminRequest())) {
      return NextResponse.json(
        { ok: false, error: "Request origin is not allowed." },
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
        { ok: false, error: phraseCheck.error },
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
        {
          ok: false,
          error: "Too many notification runs. Try again shortly.",
        },
        { status: 429 }
      );
    }

    const controls = await loadOperationalControlPausedMapSoft();
    if (controls.map.ALERT_NOTIFICATIONS) {
      const counts = emptyRunnerCounts();
      return NextResponse.json({
        ok: false,
        error: formatAlertNotificationFailureReason({ errorCode: "paused" }),
        paused: true,
        sentCount: 0,
        skippedCount: 0,
        remainingCount: 0,
        processedCount: 0,
        aggregationMs: 0,
        sendMs: 0,
        counts,
      });
    }

    const result = await evaluateAndDeliverAlertNotifications();

    revalidatePath("/admin/operations");
    revalidatePath("/admin/alerts");

    const counts = result.counts;
    const progressMessage =
      formatAlertNotificationPartialProgress({
        processed: result.processed,
        remaining: counts.remaining,
      }) ?? undefined;

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
      progressMessage,
      counts,
      paused: result.paused,
      snapshotComplete: result.snapshotComplete,
    });
  } catch (error) {
    console.error(
      "alert_notification_run",
      "UNHANDLED",
      error instanceof Error ? error.message.slice(0, 80) : "unknown"
    );
    const counts = emptyRunnerCounts();
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to run alert notifications. Please try again.",
        sentCount: 0,
        skippedCount: 0,
        remainingCount: 0,
        processedCount: 0,
        aggregationMs: 0,
        sendMs: 0,
        counts,
      },
      { status: 500 }
    );
  }
}
