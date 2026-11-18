"use server";

import { revalidatePath } from "next/cache";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  executeAdminInstantOrderRefund,
  InstantOrderRefundError,
} from "@/app/lib/admin/instantOrderRefund";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { requireRole } from "@/app/lib/auth/session";

export type InstantOrderRefundActionState =
  | null
  | {
      ok: true;
      message: string;
      orderId: string;
      amountLabel: string;
      idempotent: boolean;
    }
  | { ok: false; error: string; code?: string };

export async function adminInstantOrderRefundAction(
  _prev: InstantOrderRefundActionState,
  formData: FormData
): Promise<InstantOrderRefundActionState> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }

  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "REFUNDS_MANAGE");

  // Never trust browser money / status fields.
  void formData.get("amount");
  void formData.get("amountCents");
  void formData.get("refundAmount");
  void formData.get("refundAmountCents");
  void formData.get("status");
  void formData.get("creditWallet");

  const orderId = String(formData.get("orderId") ?? "").trim();
  const partnerPurchaseId = String(
    formData.get("partnerPurchaseId") ?? ""
  ).trim();
  const reason = formData.get("reason");

  if (!orderId) {
    return { ok: false, error: "This order is unavailable for a refund." };
  }

  try {
    const result = await executeAdminInstantOrderRefund({
      adminUserId: admin.id,
      orderId,
      partnerPurchaseId: partnerPurchaseId || undefined,
      reason,
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${encodeURIComponent(orderId)}`);
    revalidatePath("/admin/refund-requests");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/partners");
    if (result.path === "PARTNER_WALLET") {
      revalidatePath("/admin/partner-refund-requests");
    }

    return {
      ok: true,
      orderId: result.orderId,
      amountLabel: result.amountLabel,
      idempotent: result.idempotent,
      message: result.idempotent
        ? `Refund already completed. Credited ${result.amountLabel}.`
        : `Refund completed. Credited ${result.amountLabel} to ${
            result.path === "PARTNER_WALLET" ? "Partner wallet" : "MAP Wallet"
          }.`,
    };
  } catch (error) {
    if (error instanceof InstantOrderRefundError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return {
      ok: false,
      error: "Instant refund is temporarily unavailable. Please try again shortly.",
    };
  }
}
