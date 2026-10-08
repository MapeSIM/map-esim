"use server";

import { revalidatePath } from "next/cache";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  applyCustomerVerifiedPendingPayment,
  type CustomerPendingApplyActionResult,
} from "@/app/lib/admin/pendingCustomerPaymentApply";
import {
  parseCustomerApplyConfirm,
  parsePendingPaymentVerifyReason,
} from "@/app/lib/admin/pendingCustomerPaymentApplyShared";
import { requireRole } from "@/app/lib/auth/session";

export type CustomerPendingApplyFormState =
  CustomerPendingApplyActionResult | null;

/**
 * Step-2 admin apply after gateway confirmation (Safepay reporter / Simpaisa Inquire).
 * Never trusts browser amount/tracker. Uses canonical eSIM payment apply.
 */
export async function applyCustomerVerifiedPendingPaymentAction(
  _prev: CustomerPendingApplyFormState,
  formData: FormData
): Promise<CustomerPendingApplyFormState> {
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "PAYMENTS_MANAGE");

  const paymentAttemptId = String(
    formData.get("paymentAttemptId") ?? ""
  ).trim();
  const reasonParsed = parsePendingPaymentVerifyReason(formData.get("reason"));
  const confirmParsed = parseCustomerApplyConfirm(formData.get("confirm"));

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
  if (!confirmParsed.ok) {
    return {
      ok: false,
      error: confirmParsed.error,
      fieldErrors: { confirm: confirmParsed.error },
    };
  }

  const result = await applyCustomerVerifiedPendingPayment({
    adminUserId: admin.id,
    paymentAttemptId,
    reason: reasonParsed.reason,
    confirm: true,
  });

  if (result.ok) {
    revalidatePath("/admin/payments/pending");
    revalidatePath(
      `/admin/payments/pending/${encodeURIComponent(paymentAttemptId)}`
    );
    revalidatePath(
      `/admin/payments/${encodeURIComponent(paymentAttemptId)}`
    );
  }

  return result;
}
