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
      fieldErrors?: { confirmPhrase?: string; forceEvidenceOverride?: string };
    };

function readForceEvidenceOverride(value: FormDataEntryValue | null): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "on" || v === "1" || v === "yes";
}

/**
 * Duck-type across Next server-action module boundaries where `instanceof`
 * can fail on duplicate class copies.
 */
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
  const code =
    "code" in error ? String((error as { code: unknown }).code ?? "") : "";
  if (name !== "PartnerRefundRequestExecutionError" && !code) return null;
  if (
    name !== "PartnerRefundRequestExecutionError" &&
    code !== "INVALID_PHRASE" &&
    code !== "UNAVAILABLE" &&
    code !== "PROVIDER_UNCERTAIN" &&
    code !== "ORDER_ALREADY_FULFILLED" &&
    code !== "INSTALL_DETAILS_PRESENT" &&
    code !== "ICCID_PRESENT" &&
    code !== "INSTALL_RECOVERY_REQUIRED" &&
    code !== "ALREADY_REFUNDED" &&
    code !== "FINANCIAL_STATE_MISMATCH" &&
    code !== "NOT_APPROVED" &&
    code !== "PARTNER_UNAVAILABLE"
  ) {
    return null;
  }
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
  return { code: code || name, message, blocker };
}

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

  const requestId = String(formData.get("requestId") ?? "").trim();
  const confirmPhrase = String(formData.get("confirmPhrase") ?? "");
  const forceEvidenceOverride = readForceEvidenceOverride(
    formData.get("forceEvidenceOverride")
  );
  if (!requestId) {
    return { ok: false, error: "This Partner refund request is unavailable." };
  }

  console.info("partner_refund_execute_action", {
    requestId: requestId.slice(0, 64),
    forceEvidenceOverride,
    confirmPhraseLen: confirmPhrase.trim().length,
  });

  try {
    const result = await executeAdminPartnerRefundRequest({
      adminUserId: admin.id,
      requestId,
      confirmPhrase,
      forceEvidenceOverride,
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
      console.error("partner_refund_execute_blocked", {
        requestId: requestId.slice(0, 64),
        forceEvidenceOverride,
        code: mapped.code,
        blocker: mapped.blocker,
        message: mapped.message.slice(0, 300),
      });
      return {
        ok: false,
        error: mapped.message,
        blocker: mapped.blocker ?? undefined,
      };
    }
    console.error("partner_refund_execute_action_unexpected", {
      requestId: requestId.slice(0, 64),
      forceEvidenceOverride,
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
