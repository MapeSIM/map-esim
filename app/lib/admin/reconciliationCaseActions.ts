"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  deescalateReconciliationCase,
  escalateReconciliationCase,
  lockReconciliationCase,
  resolveReconciliationCase,
  unlockReconciliationCase,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import { resendReconciliationEmail } from "@/app/lib/admin/reconciliationEmailResend";
import { clearStuckReconciliationSend } from "@/app/lib/admin/reconciliationClearStuckSend";
import { backfillReconciliationIccid } from "@/app/lib/admin/reconciliationIccidBackfill";
import { finalizeReconciliationLocalRecord } from "@/app/lib/admin/reconciliationLocalFinalization";
import { refundReconciliationWalletPurchase } from "@/app/lib/admin/reconciliationWalletRefund";
import { refundReconciliationPartnerPurchase } from "@/app/lib/admin/reconciliationPartnerRefund";

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

export async function deescalateReconciliationCaseAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("currentPriority");

  const result = await deescalateReconciliationCase({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    priority: String(formData.get("priority") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
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

export async function resendReconciliationEmailAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("eligible");

  const result = await resendReconciliationEmail({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function clearStuckReconciliationSendAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("eligible");
  void formData.get("reason");

  const result = await clearStuckReconciliationSend({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function backfillReconciliationIccidAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("eligible");
  void formData.get("iccid");

  const result = await backfillReconciliationIccid({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function finalizeReconciliationLocalRecordAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("eligible");
  void formData.get("orderId");
  void formData.get("providerOrderId");

  const result = await finalizeReconciliationLocalRecord({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function refundReconciliationWalletPurchaseAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("eligible");
  // Never trust admin-supplied financial fields.
  void formData.get("amountCents");
  void formData.get("amount");
  void formData.get("currency");
  void formData.get("customerUserId");
  void formData.get("walletId");

  const result = await refundReconciliationWalletPurchase({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}

export async function refundReconciliationPartnerPurchaseAction(
  _prev: CaseManagementFormState,
  formData: FormData
): Promise<CaseManagementFormState> {
  const admin = await requireRole("ADMIN");
  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  void formData.get("caseStatus");
  void formData.get("eligible");
  // Never trust admin-supplied Partner identity or financial fields.
  void formData.get("amountCents");
  void formData.get("amount");
  void formData.get("currency");
  void formData.get("partnerId");
  void formData.get("partnerWalletId");

  const result = await refundReconciliationPartnerPurchase({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: String(formData.get("reason") ?? ""),
    confirmPhrase: String(formData.get("confirmPhrase") ?? ""),
  });
  if (result.ok) revalidateCase(sourceType, attemptId);
  return result;
}
