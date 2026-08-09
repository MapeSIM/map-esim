"use server";

import { redirect } from "next/navigation";
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

function orderDetailPath(orderId: string): string {
  return `/account/orders/${encodeURIComponent(orderId)}?refund=requested`;
}

export async function createCustomerRefundRequestAction(
  _prev: CustomerRefundRequestFormState,
  formData: FormData
): Promise<CustomerRefundRequestFormState> {
  // Never trust browser money / status fields.
  void formData.get("amount");
  void formData.get("refundAmount");
  void formData.get("refundAmountCents");
  void formData.get("status");
  void formData.get("paid");

  const orderId = String(formData.get("orderId") ?? "").trim();
  const reason = formData.get("reason");
  const customerNote = formData.get("customerNote");
  const callbackPath = orderId
    ? `/account/orders/${encodeURIComponent(orderId)}`
    : "/account/orders";

  let customer;
  try {
    customer = await requireRole("CUSTOMER", callbackPath);
  } catch (error) {
    // Preserve Next.js redirect throws from requireRole/requireSession.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      ok: false,
      error: "Please sign in again to submit a refund request.",
    };
  }

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
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
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
      // Duplicate open request: land on the order page so status is visible.
      if (error.code === "DUPLICATE_OPEN") {
        redirect(orderDetailPath(orderId));
      }
      return { ok: false, error: error.message };
    }
    // Bundled custom errors may fail instanceof — still return a safe form state.
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    if (code === "DUPLICATE_OPEN") {
      redirect(orderDetailPath(orderId));
    }
    return {
      ok: false,
      error: "Refund requests are temporarily unavailable. Please try again shortly.",
    };
  }

  // Hard navigation after insert — avoids soft RSC refresh failures on success.
  redirect(orderDetailPath(orderId));
}

export const CUSTOMER_REFUND_NOTE_MAX = REFUND_REQUEST_NOTE_MAX;
