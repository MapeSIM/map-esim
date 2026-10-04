"use server";

import { revalidatePath } from "next/cache";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  adminResendInstallEmailForLocalOrder,
  type AdminOrderInstallEmailResendResult,
} from "@/app/lib/admin/reconciliationEmailResend";
import { requireRole } from "@/app/lib/auth/session";

export type OrderInstallEmailResendFormState =
  | AdminOrderInstallEmailResendResult
  | null;

/** Support + Operations + Super Admin (via overlapping permission grants). */
const ORDER_INSTALL_EMAIL_RESEND_PERMISSIONS = [
  "SUPPORT_EMAILS",
  "ORDERS_MANAGE",
  "ESIM_FULFILLMENT",
  "INSTALL_ISSUES",
] as const;

export async function resendOrderInstallEmailAction(
  _prev: OrderInstallEmailResendFormState,
  formData: FormData
): Promise<OrderInstallEmailResendFormState> {
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, [...ORDER_INSTALL_EMAIL_RESEND_PERMISSIONS]);

  const orderId = String(formData.get("orderId") ?? "").trim();
  const result = await adminResendInstallEmailForLocalOrder({
    adminUserId: admin.id,
    orderId,
  });

  if (result.ok) {
    revalidatePath(`/admin/orders/${encodeURIComponent(orderId)}`);
    revalidatePath("/admin/emails");
    revalidatePath("/admin/reconciliation");
  }

  return result;
}
