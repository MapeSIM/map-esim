"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  escalateReconciliationCase,
  lockReconciliationCase,
  resolveReconciliationCase,
  unlockReconciliationCase,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";

export type CaseManagementFormState = CaseActionResult | null;

function revalidateCase(sourceType: string, attemptId: string) {
  revalidatePath(
    `/admin/reconciliation/${encodeURIComponent(sourceType)}/${encodeURIComponent(attemptId)}`
  );
  revalidatePath("/admin/reconciliation");
}

export async function lockReconciliationCaseAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  // Never trust browser status fields.
  void formData.get("caseStatus");
  void formData.get("locked");

  const result = await lockReconciliationCase({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function unlockReconciliationCaseAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("locked");

  const result = await unlockReconciliationCase({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function escalateReconciliationCaseAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");

  const result = await escalateReconciliationCase({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    priority: String(formData.get("priority") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function resolveReconciliationCaseAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("eligible");

  const result = await resolveReconciliationCase({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    resolutionCode: String(formData.get("resolutionCode") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}
