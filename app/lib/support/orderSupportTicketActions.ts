"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  createCustomerOrderSupportTicket,
  createPartnerOrderSupportTicket,
  OrderSupportTicketError,
} from "@/app/lib/support/orderSupportTicket";

export type CreateOrderSupportTicketFormState =
  | null
  | { ok: true; message: string; duplicate: boolean }
  | {
      ok: false;
      error: string;
      fieldErrors?: { subject?: string; details?: string };
    };

export async function createOrderSupportTicketAction(
  _prev: CreateOrderSupportTicketFormState,
  formData: FormData
): Promise<CreateOrderSupportTicketFormState> {
  // Never trust browser money / execution fields.
  void formData.get("amount");
  void formData.get("refundAmount");
  void formData.get("refundAmountCents");
  void formData.get("creditWallet");
  void formData.get("approve");
  void formData.get("executeRefund");

  const orderId = String(formData.get("orderId") ?? "").trim();
  const subject = formData.get("subject");
  const details = formData.get("details");
  const actor = String(formData.get("actor") ?? "").trim().toUpperCase();

  try {
    if (actor === "PARTNER") {
      const user = await requireRole("PARTNER");
      const result = await createPartnerOrderSupportTicket({
        partnerUserId: user.id,
        orderId,
        subject,
        details,
      });
      revalidatePath("/partner/orders");
      revalidatePath(`/partner/orders/${encodeURIComponent(orderId)}`);
      revalidatePath("/admin/support-tickets");
      return {
        ok: true,
        duplicate: result.duplicate,
        message: result.duplicate
          ? "A support ticket is already open for this order."
          : result.summary.isRefundSubject
            ? "Refund request submitted for admin review. No funds were moved."
            : "Support ticket submitted. Our team will review it shortly.",
      };
    }

    const user = await requireRole("CUSTOMER");
    const result = await createCustomerOrderSupportTicket({
      customerUserId: user.id,
      orderId,
      subject,
      details,
    });
    revalidatePath("/account/orders");
    revalidatePath(`/account/orders/${encodeURIComponent(orderId)}`);
    revalidatePath("/admin/support-tickets");
    return {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? "A support ticket is already open for this order."
        : result.summary.isRefundSubject
          ? "Refund request submitted for admin review. No funds were moved."
          : "Support ticket submitted. Our team will review it shortly.",
    };
  } catch (error) {
    if (error instanceof OrderSupportTicketError) {
      const fieldErrors: { subject?: string; details?: string } = {};
      if (error.code === "INVALID_SUBJECT") fieldErrors.subject = error.message;
      if (error.code === "INVALID_DETAILS") fieldErrors.details = error.message;
      return {
        ok: false,
        error: error.message,
        fieldErrors:
          Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      };
    }
    return {
      ok: false,
      error: "Unable to submit the support ticket right now.",
    };
  }
}
