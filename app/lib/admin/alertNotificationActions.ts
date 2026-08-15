"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth/session";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  ALERT_NOTIFICATION_CONFIRM_PHRASE,
  emptyRunnerCounts,
  type SafeRunnerCounts,
} from "@/app/lib/admin/alertNotificationShared";
import { evaluateAndDeliverAlertNotifications } from "@/app/lib/admin/alertNotificationRunner";
import { loadOperationalControlPausedMapSoft } from "@/app/lib/admin/operationalControlsPolicy";
import { parseOperationalConfirmPhrase } from "@/app/lib/admin/operationalControlsShared";

export type RunAlertNotificationsFormState = {
  ok: boolean;
  error?: string;
  counts?: SafeRunnerCounts;
  paused?: boolean;
  snapshotComplete?: boolean;
} | null;

async function requireActiveAdmin() {
  const sessionUser = await requireRole("ADMIN");
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
  const admin = await requireActiveAdmin();

  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "Request origin is not allowed." };
  }

  const phrase = String(formData.get("confirmPhrase") ?? "");
  const phraseCheck = parseOperationalConfirmPhrase(
    phrase,
    ALERT_NOTIFICATION_CONFIRM_PHRASE
  );
  if (!phraseCheck.ok) {
    return { ok: false, error: phraseCheck.error };
  }

  const rate = consumeRateLimit({
    key: `alert-notify-run:${admin.id}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!rate.ok) {
    return {
      ok: false,
      error: "Too many notification runs. Try again shortly.",
    };
  }

  const controls = await loadOperationalControlPausedMapSoft();
  if (controls.map.ALERT_NOTIFICATIONS) {
    return {
      ok: false,
      error: "Alert notifications are paused. Resume the control before running.",
      paused: true,
      counts: emptyRunnerCounts(),
    };
  }

  const result = await evaluateAndDeliverAlertNotifications();
  revalidatePath("/admin/operations");
  revalidatePath("/admin/alerts");

  if (!result.ok && result.errorCode === "invalid_recipients") {
    return {
      ok: false,
      error:
        "Alert notification recipients are not configured. Set ALERT_NOTIFICATION_RECIPIENTS on the server.",
      counts: result.counts,
      snapshotComplete: result.snapshotComplete,
    };
  }
  if (!result.ok && result.errorCode === "runner_busy") {
    return {
      ok: false,
      error: "Another notification run is already in progress.",
      counts: result.counts,
    };
  }

  return {
    ok: true,
    counts: result.counts,
    paused: result.paused,
    snapshotComplete: result.snapshotComplete,
  };
}
