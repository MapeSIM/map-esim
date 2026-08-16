"use server";

import { revalidatePath } from "next/cache";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { requireRole } from "@/app/lib/auth/session";
import {
  applyAdminPartnerRefundRequestDecision,
  PartnerRefundRequestAdminError,
  type AdminPartnerRefundDecisionAction,
} from "@/app/lib/partner/partnerRefundRequestAdmin";

export type AdminPartnerRefundRequestFormState =
  | null
  | { ok: true; message: string; status: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: { decisionNote?: string };
    };

function parseAction(raw: unknown): AdminPartnerRefundDecisionAction | null {
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

export async function adminPartnerRefundRequestDecisionAction(
  _prev: AdminPartnerRefundRequestFormState,
  formData: FormData
): Promise<AdminPartnerRefundRequestFormState> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }

  const admin = await requireRole("ADMIN");

  void formData.get("amount");
  void formData.get("amountCents");
  void formData.get("refundAmount");
  void formData.get("refundAmountCents");
  void formData.get("partnerChargeCents");
  void formData.get("partnerId");
  void formData.get("creditWallet");
  void formData.get("executeRefund");
  void formData.get("execute");
  void formData.get("markCompleted");
  void formData.get("targetStatus");
  void formData.get("status");

  const requestId = String(formData.get("requestId") ?? "").trim();
  const action = parseAction(formData.get("action"));
  const decisionNote = formData.get("decisionNote");

  if (!requestId || !action) {
    return { ok: false, error: "This refund request action is invalid." };
  }

  try {
    const result = await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId,
      action,
      decisionNote,
      amount: formData.get("amount"),
      amountCents: formData.get("amountCents"),
      partnerId: formData.get("partnerId"),
      creditWallet: formData.get("creditWallet"),
      executeRefund: formData.get("executeRefund"),
      targetStatus: formData.get("targetStatus"),
    });
    revalidatePath("/admin/refund-requests");
    revalidatePath(
      `/admin/refund-requests/partner/${encodeURIComponent(requestId)}`
    );
    revalidatePath("/partner/orders");
    const message =
      action === "approve"
        ? "Approved for later execution. No Partner wallet credit or provider change was performed."
        : action === "reject"
          ? "Refund request rejected. No funds were moved."
          : "Marked under review.";
    return { ok: true, message, status: result.status };
  } catch (error) {
    if (error instanceof PartnerRefundRequestAdminError) {
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
      error: "Partner refund request update is temporarily unavailable.",
    };
  }
}
