"use server";

import { revalidatePath } from "next/cache";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  cancelWhatsAppCheckoutOrder,
  fulfillWhatsAppCheckoutOrder,
  type WhatsAppFulfillResult,
} from "@/app/lib/admin/whatsappCheckoutFulfillment";
import { requireRole } from "@/app/lib/auth/session";

export type WhatsAppFulfillFormState = WhatsAppFulfillResult | null;

export async function fulfillWhatsAppCheckoutOrderAction(
  _prev: WhatsAppFulfillFormState,
  formData: FormData
): Promise<WhatsAppFulfillFormState> {
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "ESIM_FULFILLMENT");
  const whatsappOrderId = String(formData.get("whatsappOrderId") ?? "").trim();
  const result = await fulfillWhatsAppCheckoutOrder({
    adminUserId: admin.id,
    whatsappOrderId,
  });
  if (result.ok) {
    revalidatePath("/admin/whatsapp-orders");
    revalidatePath("/admin/orders");
  }
  return result;
}

export async function cancelWhatsAppCheckoutOrderAction(
  _prev: WhatsAppFulfillFormState,
  formData: FormData
): Promise<WhatsAppFulfillFormState> {
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, ["ESIM_FULFILLMENT", "ORDERS_MANAGE"]);
  const whatsappOrderId = String(formData.get("whatsappOrderId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const result = await cancelWhatsAppCheckoutOrder({
    adminUserId: admin.id,
    whatsappOrderId,
    reason,
  });
  if (result.ok) {
    revalidatePath("/admin/whatsapp-orders");
  }
  return result;
}
