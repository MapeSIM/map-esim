"use server";

import { revalidatePath } from "next/cache";
import {
  checkSimpaisaPendingPaymentStatus,
  releaseSimpaisaPendingReservation,
  type SimpaisaPendingInvestigateActionResult,
  type SimpaisaPendingReleaseActionResult,
} from "@/app/lib/admin/pendingSimpaisaPaymentInvestigate";
import { parsePendingPaymentVerifyReason } from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import { requireRole } from "@/app/lib/auth/session";

export type SimpaisaPendingInvestigateFormState =
  SimpaisaPendingInvestigateActionResult | null;

export type SimpaisaPendingReleaseFormState =
  SimpaisaPendingReleaseActionResult | null;

function ignoreForgedBrowserAuthority(formData: FormData) {
  // Explicitly ignore browser-supplied payment authority fields.
  void formData.get("tracker");
  void formData.get("trackerToken");
  void formData.get("amount");
  void formData.get("currency");
  void formData.get("status");
  void formData.get("providerPaymentRef");
  void formData.get("transactionId");
  void formData.get("userKey");
  void formData.get("operatorId");
}

/**
 * Step 1: Admin Inquire status check for an existing Simpaisa payment attempt.
 * Never funds purchases / never marks paid / never releases reservation.
 */
export async function checkSimpaisaPendingPaymentStatusAction(
  _prev: SimpaisaPendingInvestigateFormState,
  formData: FormData
): Promise<SimpaisaPendingInvestigateFormState> {
  const admin = await requireRole("ADMIN");

  const paymentAttemptId = String(
    formData.get("paymentAttemptId") ?? ""
  ).trim();
  const reasonParsed = parsePendingPaymentVerifyReason(formData.get("reason"));
  ignoreForgedBrowserAuthority(formData);

  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const result = await checkSimpaisaPendingPaymentStatus({
    adminUserId: admin.id,
    paymentAttemptId,
    reason: reasonParsed.reason,
  });

  if (result.ok) {
    revalidatePath("/admin/payments/pending");
    revalidatePath(
      `/admin/payments/pending/${encodeURIComponent(paymentAttemptId)}`
    );
  }

  return result;
}

/**
 * Step 2: Release reservation only after fresh Inquire confirms failed/terminal unpaid.
 * Never funds / never marks paid.
 */
export async function releaseSimpaisaPendingReservationAction(
  _prev: SimpaisaPendingReleaseFormState,
  formData: FormData
): Promise<SimpaisaPendingReleaseFormState> {
  const admin = await requireRole("ADMIN");

  const paymentAttemptId = String(
    formData.get("paymentAttemptId") ?? ""
  ).trim();
  const reasonParsed = parsePendingPaymentVerifyReason(formData.get("reason"));
  ignoreForgedBrowserAuthority(formData);

  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const result = await releaseSimpaisaPendingReservation({
    adminUserId: admin.id,
    paymentAttemptId,
    reason: reasonParsed.reason,
  });

  if (result.ok) {
    revalidatePath("/admin/payments/pending");
    revalidatePath(
      `/admin/payments/pending/${encodeURIComponent(paymentAttemptId)}`
    );
  }

  return result;
}
