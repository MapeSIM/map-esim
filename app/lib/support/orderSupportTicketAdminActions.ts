"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  approveOrderSupportTicketRefund,
  OrderSupportTicketAdminError,
  rejectOrderSupportTicket,
  resolveOrderSupportTicket,
  setOrderSupportTicketInfoRequired,
  setOrderSupportTicketInReview,
} from "@/app/lib/support/orderSupportTicketAdmin";

export type AdminSupportTicketFormState =
  | null
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function adminResolveSupportTicketAction(
  _prev: AdminSupportTicketFormState,
  formData: FormData
): Promise<AdminSupportTicketFormState> {
  const admin = await requireRole("ADMIN");
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  try {
    await resolveOrderSupportTicket({
      adminUserId: admin.id,
      ticketId,
      note: formData.get("note"),
    });
    revalidatePath("/admin/support-tickets");
    revalidatePath(`/admin/support-tickets/${ticketId}`);
    return { ok: true, message: "Ticket marked resolved." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof OrderSupportTicketAdminError
          ? error.message
          : "Unable to resolve ticket.",
    };
  }
}

export async function adminRejectSupportTicketAction(
  _prev: AdminSupportTicketFormState,
  formData: FormData
): Promise<AdminSupportTicketFormState> {
  const admin = await requireRole("ADMIN");
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  try {
    await rejectOrderSupportTicket({
      adminUserId: admin.id,
      ticketId,
      note: formData.get("note"),
    });
    revalidatePath("/admin/support-tickets");
    revalidatePath(`/admin/support-tickets/${ticketId}`);
    return { ok: true, message: "Ticket rejected." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof OrderSupportTicketAdminError
          ? error.message
          : "Unable to reject ticket.",
    };
  }
}

export async function adminApproveSupportTicketRefundAction(
  _prev: AdminSupportTicketFormState,
  formData: FormData
): Promise<AdminSupportTicketFormState> {
  void formData.get("amount");
  void formData.get("refundAmountCents");
  const admin = await requireRole("ADMIN");
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  try {
    const result = await approveOrderSupportTicketRefund({
      adminUserId: admin.id,
      ticketId,
      note: formData.get("note"),
    });
    revalidatePath("/admin/support-tickets");
    revalidatePath(`/admin/support-tickets/${ticketId}`);
    revalidatePath("/admin/refund-requests");
    revalidatePath("/partner/orders");
    revalidatePath("/account/orders");
    return {
      ok: true,
      message: result.idempotent
        ? "Refund already completed (idempotent)."
        : "Refund approved and wallet credited once.",
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof OrderSupportTicketAdminError
          ? error.message
          : "Unable to approve refund.",
    };
  }
}

export async function adminSetSupportTicketInReviewAction(
  _prev: AdminSupportTicketFormState,
  formData: FormData
): Promise<AdminSupportTicketFormState> {
  const admin = await requireRole("ADMIN");
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  try {
    await setOrderSupportTicketInReview({
      adminUserId: admin.id,
      ticketId,
      note: formData.get("note"),
    });
    revalidatePath("/admin/support-tickets");
    revalidatePath(`/admin/support-tickets/${ticketId}`);
    revalidatePath("/partner/orders");
    revalidatePath("/account/orders");
    return { ok: true, message: "Ticket marked In Review." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof OrderSupportTicketAdminError
          ? error.message
          : "Unable to update ticket.",
    };
  }
}

export async function adminSetSupportTicketInfoRequiredAction(
  _prev: AdminSupportTicketFormState,
  formData: FormData
): Promise<AdminSupportTicketFormState> {
  const admin = await requireRole("ADMIN");
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  try {
    await setOrderSupportTicketInfoRequired({
      adminUserId: admin.id,
      ticketId,
      note: formData.get("note"),
    });
    revalidatePath("/admin/support-tickets");
    revalidatePath(`/admin/support-tickets/${ticketId}`);
    revalidatePath("/partner/orders");
    revalidatePath("/account/orders");
    return { ok: true, message: "Ticket marked Info Required." };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof OrderSupportTicketAdminError
          ? error.message
          : "Unable to update ticket.",
    };
  }
}
