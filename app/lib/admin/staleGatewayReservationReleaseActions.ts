"use server";

import { revalidatePath } from "next/cache";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  releaseStaleGatewayReservation,
  type StaleGatewayReleaseResult,
} from "@/app/lib/admin/staleGatewayReservationRelease";
import { parsePendingPaymentVerifyReason } from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import type { PaymentRecoveryOwnerKind } from "@/app/lib/admin/paymentRecoveryShared";
import { requireRole } from "@/app/lib/auth/session";

export type StaleGatewayReleaseFormState = StaleGatewayReleaseResult | null;

function ignoreForgedBrowserAuthority(formData: FormData) {
  void formData.get("tracker");
  void formData.get("trackerToken");
  void formData.get("amount");
  void formData.get("currency");
  void formData.get("status");
  void formData.get("providerPaymentRef");
  void formData.get("transactionId");
  void formData.get("markPaid");
  void formData.get("fund");
}

/**
 * Admin stale reservation release. Never funds / marks paid / replays webhooks.
 * Failures must return form state — never throw (throws crash the payment detail RSC).
 */
export async function releaseStaleGatewayReservationAction(
  _prev: StaleGatewayReleaseFormState,
  formData: FormData
): Promise<StaleGatewayReleaseFormState> {
  try {
    const admin = await requireRole("ADMIN");
    await assertAdminPermission(admin.id, "PAYMENTS_MANAGE");

    const paymentAttemptId = String(
      formData.get("paymentAttemptId") ?? ""
    ).trim();
    const ownerRaw = String(formData.get("ownerKind") ?? "").trim();
    const ownerKind: PaymentRecoveryOwnerKind | null =
      ownerRaw === "partner"
        ? "partner"
        : ownerRaw === "customer"
          ? "customer"
          : null;
    const reasonParsed = parsePendingPaymentVerifyReason(formData.get("reason"));
    ignoreForgedBrowserAuthority(formData);

    if (!paymentAttemptId || paymentAttemptId.length > 64) {
      return {
        ok: false,
        error: "Payment attempt is missing or invalid.",
      };
    }

    if (!reasonParsed.ok) {
      return {
        ok: false,
        error: reasonParsed.error,
        fieldErrors: { reason: reasonParsed.error },
      };
    }

    const result = await releaseStaleGatewayReservation({
      adminUserId: admin.id,
      paymentAttemptId,
      reason: reasonParsed.reason,
      ownerKind,
    });

    if (result.ok) {
      revalidatePath("/admin/payments/recovery");
      revalidatePath("/admin/payments/pending");
      revalidatePath(`/admin/payments/${encodeURIComponent(paymentAttemptId)}`);
      revalidatePath(
        `/admin/payments/pending/${encodeURIComponent(paymentAttemptId)}`
      );
    }

    return result;
  } catch (error) {
    console.error("[admin.payments.stale_release] action failed", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorCode:
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : undefined,
    });
    return {
      ok: false,
      error:
        "Could not release this reservation right now. Refresh the page and try again shortly.",
    };
  }
}
