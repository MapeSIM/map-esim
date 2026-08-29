"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  applyAdminRefundRequestDecision,
  RefundRequestError,
  type AdminRefundDecisionAction,
} from "@/app/lib/refunds/refundRequest";
import { sendVesimRefundReviewEmail } from "@/app/lib/refunds/refundRequestVesimReview";

export type AdminRefundRequestFormState =
  | null
  | { ok: true; message: string; status: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: { decisionNote?: string };
    };

function parseAction(raw: unknown): AdminRefundDecisionAction | null {
  const value = String(raw ?? "").trim();
  if (
    value === "mark_under_review" ||
    value === "approve" ||
    value === "reject"
  ) {
    return value;
  }
  return null;
}

export async function adminRefundRequestDecisionAction(
  _prev: AdminRefundRequestFormState,
  formData: FormData
): Promise<AdminRefundRequestFormState> {
  const admin = await requireRole("ADMIN");

  // Never accept money-movement or completion flags from the browser.
  void formData.get("creditWallet");
  void formData.get("executeRefund");
  void formData.get("markCompleted");
  void formData.get("amount");

  const requestId = String(formData.get("requestId") ?? "").trim();
  const action = parseAction(formData.get("action"));
  const decisionNote = formData.get("decisionNote");

  if (!requestId || !action) {
    return { ok: false, error: "This refund request action is invalid." };
  }

  try {
    const result = await applyAdminRefundRequestDecision({
      adminUserId: admin.id,
      requestId,
      action,
      decisionNote,
    });
    revalidatePath("/admin/refund-requests");
    revalidatePath(`/admin/refund-requests/${encodeURIComponent(requestId)}`);
    const message =
      action === "approve"
        ? "Approved for later execution. No wallet credit or gateway refund was performed."
        : action === "reject"
          ? "Refund request rejected. No funds were moved."
          : "Marked under review.";
    return { ok: true, message, status: result.status };
  } catch (error) {
    if (error instanceof RefundRequestError) {
      if (error.code === "INVALID_NOTE") {
        return {
          ok: false,
          error: error.message,
          fieldErrors: { decisionNote: error.message },
        };
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Refund request update is temporarily unavailable.",
    };
  }
}

export type AdminVesimReviewFormState =
  | null
  | { ok: true; message: string; alreadySent?: boolean }
  | { ok: false; error: string };

/**
 * Admin-only: send provider refund-review email to VeSIM.
 * Does not change refund status or move money.
 */
export async function adminSendVesimRefundReviewAction(
  _prev: AdminVesimReviewFormState,
  formData: FormData
): Promise<AdminVesimReviewFormState> {
  const admin = await requireRole("ADMIN");

  // Never accept money-movement or status flags from the browser.
  void formData.get("creditWallet");
  void formData.get("executeRefund");
  void formData.get("approve");
  void formData.get("reject");
  void formData.get("iccid");

  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId || requestId.length > 64) {
    return { ok: false, error: "This refund request action is invalid." };
  }

  const result = await sendVesimRefundReviewEmail({
    adminUserId: admin.id,
    requestId,
  });

  revalidatePath("/admin/refund-requests");
  revalidatePath(`/admin/refund-requests/${encodeURIComponent(requestId)}`);

  if (result.ok) {
    return {
      ok: true,
      message: result.message,
      alreadySent: result.status === "already_sent",
    };
  }

  return { ok: false, error: result.message };
}
