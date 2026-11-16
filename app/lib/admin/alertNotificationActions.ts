"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
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
  type SafeRunnerCounts,
} from "@/app/lib/admin/alertNotificationShared";
import { evaluateAndDeliverAlertNotifications } from "@/app/lib/admin/alertNotificationRunner";
import { loadOperationalControlPausedMapSoft } from "@/app/lib/admin/operationalControlsPolicy";
import { parseOperationalConfirmPhrase } from "@/app/lib/admin/operationalControlsShared";

export type RunAlertNotificationsFormState = {
  ok: boolean;
  error?: string;
  /** Structured counts for banners — prefer these over digging into `counts`. */
  sentCount?: number;
  skippedCount?: number;
  remainingCount?: number;
  /** Present when a bounded batch left more outbox work. */
  progressMessage?: string;
  counts?: SafeRunnerCounts;
  paused?: boolean;
  snapshotComplete?: boolean;
} | null;

/** Hard ceiling above the 8s runner budget; client uses 15s. */
const SERVER_RUN_TIMEOUT_MS = 10_000;

function skippedCountFrom(counts: SafeRunnerCounts): number {
  return counts.suppressed + counts.cooldown;
}

function toBannerState(input: {
  ok: boolean;
  error?: string;
  progressMessage?: string;
  counts?: SafeRunnerCounts;
  paused?: boolean;
  snapshotComplete?: boolean;
}): NonNullable<RunAlertNotificationsFormState> {
  const counts = input.counts ?? emptyRunnerCounts();
  return {
    ok: input.ok,
    error: input.error,
    progressMessage: input.progressMessage,
    sentCount: counts.sent,
    skippedCount: skippedCountFrom(counts),
    remainingCount: counts.remaining,
    counts,
    paused: input.paused,
    snapshotComplete: input.snapshotComplete,
  };
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

async function requireActiveAdmin() {
  const sessionUser = await requireRole("ADMIN");
  await assertAdminPermission(sessionUser.id, "ALERTS_VIEW");
  const admin = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) {
    redirect("/signin");
  }
  return admin;
}

export async function runAlertNotificationsAction(
  _prev: RunAlertNotificationsFormState,
  formData: FormData
): Promise<RunAlertNotificationsFormState> {
  try {
    const admin = await requireActiveAdmin();

    if (!(await assertSameOriginAdminRequest())) {
      return toBannerState({
        ok: false,
        error: "Request origin is not allowed.",
      });
    }

    const phrase = String(formData.get("confirmPhrase") ?? "");
    const phraseCheck = parseOperationalConfirmPhrase(
      phrase,
      ALERT_NOTIFICATION_CONFIRM_PHRASE
    );
    if (!phraseCheck.ok) {
      return toBannerState({ ok: false, error: phraseCheck.error });
    }

    const rate = consumeRateLimit({
      key: `alert-notify-run:${admin.id}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rate.ok) {
      return toBannerState({
        ok: false,
        error: "Too many notification runs. Try again shortly.",
      });
    }

    const controls = await loadOperationalControlPausedMapSoft();
    if (controls.map.ALERT_NOTIFICATIONS) {
      return toBannerState({
        ok: false,
        error: formatAlertNotificationFailureReason({ errorCode: "paused" }),
        paused: true,
        counts: emptyRunnerCounts(),
      });
    }

    let result: Awaited<ReturnType<typeof evaluateAndDeliverAlertNotifications>>;
    try {
      result = await withTimeout(
        evaluateAndDeliverAlertNotifications(),
        SERVER_RUN_TIMEOUT_MS,
        "ALERT_RUN_TIMEOUT"
      );
    } catch (error) {
      const timedOut =
        error instanceof Error && error.message === "ALERT_RUN_TIMEOUT";
      console.error(
        "alert_notification_run",
        timedOut ? "TIMEOUT" : "FAILED"
      );
      return toBannerState({
        ok: false,
        error: timedOut
          ? "Alert notification run timed out on the server. Wait a moment, then try again."
          : "Unable to run alert notifications. Please try again.",
        counts: emptyRunnerCounts(),
      });
    }

    revalidatePath("/admin/operations");
    revalidatePath("/admin/alerts");

    if (!result.ok) {
      return toBannerState({
        ok: false,
        error: formatAlertNotificationFailureReason({
          errorCode: result.errorCode,
          detail: result.errorDetail,
        }),
        counts: result.counts,
        snapshotComplete: result.snapshotComplete,
        paused: result.paused,
        progressMessage:
          formatAlertNotificationPartialProgress({
            processed: result.processed,
            remaining: result.counts.remaining,
          }) ?? undefined,
      });
    }

    const progressMessage =
      formatAlertNotificationPartialProgress({
        processed: result.processed,
        remaining: result.counts.remaining,
      }) ?? undefined;

    return toBannerState({
      ok: true,
      counts: result.counts,
      paused: result.paused,
      snapshotComplete: result.snapshotComplete,
      progressMessage,
    });
  } catch {
    console.error("alert_notification_run", "UNHANDLED");
    return toBannerState({
      ok: false,
      error: "Unable to run alert notifications. Please try again.",
      counts: emptyRunnerCounts(),
    });
  }
}
