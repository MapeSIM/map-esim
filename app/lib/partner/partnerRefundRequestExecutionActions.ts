"use server";

import { revalidatePath } from "next/cache";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
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

export async function adminPartnerRefundRequestExecuteAction(
  _prev: AdminPartnerRefundExecuteFormState,
  formData: FormData
): Promise<AdminPartnerRefundExecuteFormState> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }

  const admin = await requireRole("ADMIN");

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
  const confirmPhrase = formData.get("confirmPhrase");
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
    if (error instanceof PartnerRefundRequestExecutionError) {
      if (error.code === "INVALID_PHRASE") {
        return {
          ok: false,
          error: error.message,
          fieldErrors: { confirmPhrase: error.message },
        };
      }
      return {
        ok: false,
        error: error.message,
        blocker: error.blocker ?? undefined,
      };
    }
    return {
      ok: false,
      error: "Partner refund execution is temporarily unavailable.",
    };
  }
}
