"use server";

import { revalidatePath } from "next/cache";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { requireRole } from "@/app/lib/auth/session";
import {
  executeAdminPartnerRefundRequest,
  PartnerRefundRequestExecutionError,
} from "@/app/lib/partner/partnerRefundRequestExecution";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type AdminPartnerRefundExecuteFormState =
  | null
  | { ok: true; message: string; status: string }
  | {
      ok: false;
      error: string;
      blocker?: string;
      fieldErrors?: { confirmPhrase?: string };
    };

/** Duck-type across Next server-action module boundaries. */
function asPartnerRefundExecutionError(error: unknown): {
  code: string;
  message: string;
  blocker: string | null;
} | null {
  if (error instanceof PartnerRefundRequestExecutionError) {
    return {
      code: error.code,
      message: error.message,
      blocker: error.blocker,
    };
  }
  if (typeof error !== "object" || error === null) return null;
  const name =
    "name" in error ? String((error as { name: unknown }).name ?? "") : "";
  if (name !== "PartnerRefundRequestExecutionError") return null;
  const code =
    "code" in error ? String((error as { code: unknown }).code ?? "") : "";
  const message =
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Partner refund execution failed.";
  const blockerRaw =
    "blocker" in error ? (error as { blocker: unknown }).blocker : null;
  const blocker =
    typeof blockerRaw === "string" && blockerRaw.trim()
      ? blockerRaw.trim()
      : null;
  return { code, message, blocker };
}

/**
 * Mirrors adminCustomerRefundRequestExecuteAction: origin + admin + phrase + execute.
 */
export async function adminPartnerRefundRequestExecuteAction(
  _prev: AdminPartnerRefundExecuteFormState,
  formData: FormData
): Promise<AdminPartnerRefundExecuteFormState> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }

  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "REFUNDS_MANAGE");

  void formData.get("amount");
  void formData.get("amountCents");
  void formData.get("refundAmount");
  void formData.get("partnerChargeCents");
  void formData.get("partnerId");
  void formData.get("walletTransactionId");
  void formData.get("status");
  void formData.get("execute");
  void formData.get("providerResult");
  void formData.get("forceEvidenceOverride");

  const requestId = String(formData.get("requestId") ?? "").trim();
  const confirmPhrase = String(formData.get("confirmPhrase") ?? "");
  if (!requestId) {
    return { ok: false, error: "This Partner refund request is unavailable." };
  }

  try {
    const result = await executeAdminPartnerRefundRequest({
      adminUserId: admin.id,
      requestId,
      confirmPhrase,
      amount: formData.get("amount"),
      amountCents: formData.get("amountCents"),
      partnerId: formData.get("partnerId"),
      walletTransactionId: formData.get("walletTransactionId"),
      status: formData.get("status"),
      execute: formData.get("execute"),
      providerResult: formData.get("providerResult"),
    });
    revalidatePath("/admin/refund-requests");
    revalidatePath(
      `/admin/refund-requests/partner/${encodeURIComponent(requestId)}`
    );
    revalidatePath("/partner/orders");
    return {
      ok: true,
      status: result.status,
      message: result.idempotent
        ? "Partner funds were already refunded. The request is completed."
        : `Partner refund completed. ${formatUsdCents(result.amountCents)} returned to the Partner wallet.`,
    };
  } catch (error) {
    const mapped = asPartnerRefundExecutionError(error);
    if (mapped) {
      if (mapped.code === "INVALID_PHRASE") {
        return {
          ok: false,
          error: mapped.message,
          fieldErrors: { confirmPhrase: mapped.message },
        };
      }
      return {
        ok: false,
        error: mapped.message,
        blocker: mapped.blocker ?? undefined,
      };
    }
    console.error("partner_refund_execute_action_unexpected", {
      requestId: requestId.slice(0, 64),
      name: error instanceof Error ? error.name : typeof error,
      message:
        error instanceof Error
          ? error.message.slice(0, 500)
          : String(error).slice(0, 500),
    });
    return {
      ok: false,
      error: "Partner refund execution is temporarily unavailable.",
    };
  }
}
