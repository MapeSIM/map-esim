"use server";

import { revalidatePath } from "next/cache";
import {
  verifyPendingGatewayPayment,
  type PendingPaymentVerifyActionResult,
} from "@/app/lib/admin/pendingPaymentVerify";
import { parsePendingPaymentVerifyReason } from "@/app/lib/admin/pendingPaymentVerifyShared";
import { requireRole } from "@/app/lib/auth/session";

export type PendingPaymentVerifyFormState =
  PendingPaymentVerifyActionResult | null;

/**
 * Admin verify of an existing Safepay payment attempt via authenticated reporter.
 * Never accepts browser tracker/amount as authority. Never funds purchases.
 */
export async function verifyPendingGatewayPaymentAction(
  _prev: PendingPaymentVerifyFormState,
  formData: FormData
): Promise<PendingPaymentVerifyFormState> {
  const admin = await requireRole("ADMIN");

  const paymentAttemptId = String(formData.get("paymentAttemptId") ?? "").trim();
  const reasonParsed = parsePendingPaymentVerifyReason(formData.get("reason"));

  // Explicitly ignore browser-supplied payment authority fields.
  void formData.get("tracker");
  void formData.get("trackerToken");
  void formData.get("amount");
  void formData.get("currency");
  void formData.get("status");
  void formData.get("providerPaymentRef");

  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const result = await verifyPendingGatewayPayment({
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
