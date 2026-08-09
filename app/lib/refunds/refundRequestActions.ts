"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  createCustomerRefundRequest,
  RefundRequestError,
} from "@/app/lib/refunds/refundRequest";
import { REFUND_REQUEST_NOTE_MAX } from "@/app/lib/refunds/refundRequestConstants";

export type CustomerRefundRequestFormState =
  | null
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: { reason?: string; customerNote?: string };
    };

export async function createCustomerRefundRequestAction(
  _prev: CustomerRefundRequestFormState,
  formData: FormData
): Promise<CustomerRefundRequestFormState> {
  const customer = await requireRole("CUSTOMER");

  // Never trust browser money / status fields.
  void formData.get("amount");
  void formData.get("refundAmount");
  void formData.get("refundAmountCents");
  void formData.get("status");
  void formData.get("paid");

  const orderId = String(formData.get("orderId") ?? "").trim();
  const reason = formData.get("reason");
  const customerNote = formData.get("customerNote");

  if (!orderId) {
    return { ok: false, error: "This order is unavailable for a refund request." };
  }

  try {
    await createCustomerRefundRequest({
      customerUserId: customer.id,
      orderId,
      reason,
      customerNote,
    });
  } catch (error) {
    if (error instanceof RefundRequestError) {
      if (error.code === "INVALID_REASON") {
        return {
          ok: false,
          error: error.message,
          fieldErrors: { reason: error.message },
        };
      }
      if (error.code === "INVALID_NOTE") {
        return {
          ok: false,
          error: error.message,
          fieldErrors: { customerNote: error.message },
        };
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Refund requests are temporarily unavailable. Please try again shortly.",
    };
  }

  revalidatePath(`/account/orders/${encodeURIComponent(orderId)}`);
  return {
    ok: true,
    message:
      "Your refund request was submitted for review. No funds have been moved yet.",
  };
}

export const CUSTOMER_REFUND_NOTE_MAX = REFUND_REQUEST_NOTE_MAX;
