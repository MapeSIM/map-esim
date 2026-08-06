"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  setOperationalControlPaused,
  type ControlMutationResult,
} from "@/app/lib/admin/operationalControls";

export type OperationalControlFormState = ControlMutationResult | null;

function revalidateOperations() {
  revalidatePath("/admin/operations");
}

export async function pauseOperationalControlAction(
  _prev: OperationalControlFormState,
  formData: FormData
): Promise<OperationalControlFormState> {
  const admin = await requireRole("ADMIN");
  const result = await setOperationalControlPaused({
    adminUserId: admin.id,
    controlKey: String(formData.get("controlKey") ?? ""),
    paused: true,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
    expectedVersion: (() => {
      const raw = String(formData.get("expectedVersion") ?? "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
  });
  if (result.ok) revalidateOperations();
  return result;
}

export async function resumeOperationalControlAction(
  _prev: OperationalControlFormState,
  formData: FormData
): Promise<OperationalControlFormState> {
  const admin = await requireRole("ADMIN");
  const result = await setOperationalControlPaused({
    adminUserId: admin.id,
    controlKey: String(formData.get("controlKey") ?? ""),
    paused: false,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
    expectedVersion: (() => {
      const raw = String(formData.get("expectedVersion") ?? "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
  });
  if (result.ok) revalidateOperations();
  return result;
}
