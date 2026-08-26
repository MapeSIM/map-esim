"use server";

import { revalidatePath } from "next/cache";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { requireRole } from "@/app/lib/auth/session";
import {
  CustomerRefundRequestExecutionError,
  executeAdminCustomerRefundRequest,
} from "@/app/lib/refunds/refundRequestExecution";
import { formatUsdCents } from "@/app/lib/wallet/display";

export type AdminCustomerRefundExecuteFormState =
  | null
  | { ok: true; message: string; status: string }
  | {
      ok: false;
      error: string;
      blocker?: string;
      fieldErrors?: { confirmPhrase?: string };
    };

export async function adminCustomerRefundRequestExecuteAction(
  _prev: AdminCustomerRefundExecuteFormState,
  formData: FormData
): Promise<AdminCustomerRefundExecuteFormState> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }

  const admin = await requireRole("ADMIN");

  // Never trust browser money / gateway / completion fields.
  void formData.get("amount");
  void formData.get("amountCents");
  void formData.get("refundAmount");
  void formData.get("refundAmountCents");
  void formData.get("creditWallet");
  void formData.get("executeRefund");
  void formData.get("markCompleted");
  void formData.get("requestRefund");
  void formData.get("status");

  const requestId = String(formData.get("requestId") ?? "").trim();
  const confirmPhrase = formData.get("confirmPhrase");
  if (!requestId) {
    return { ok: false, error: "This refund request is unavailable." };
  }

  try {
    const result = await executeAdminCustomerRefundRequest({
      adminUserId: admin.id,
      requestId,
      confirmPhrase,
      amount: formData.get("amount"),
      amountCents: formData.get("amountCents"),
      refundAmountCents: formData.get("refundAmountCents"),
      creditWallet: formData.get("creditWallet"),
      executeRefund: formData.get("executeRefund"),
      markCompleted: formData.get("markCompleted"),
      requestRefund: formData.get("requestRefund"),
    });
    revalidatePath("/admin/refund-requests");
    revalidatePath(`/admin/refund-requests/${encodeURIComponent(requestId)}`);
    return {
      ok: true,
      status: result.status,
      message: result.idempotent
        ? `Refund already completed. MAP Wallet credited ${formatUsdCents(result.amountCents)}.`
        : `Refund completed. MAP Wallet credited ${formatUsdCents(result.amountCents)}.`,
    };
  } catch (error) {
    if (error instanceof CustomerRefundRequestExecutionError) {
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
      error: "Customer refund execution is temporarily unavailable.",
    };
  }
}
