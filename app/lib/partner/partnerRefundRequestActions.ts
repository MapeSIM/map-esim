"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  createPartnerRefundRequest,
  PartnerRefundRequestError,
} from "@/app/lib/partner/partnerRefundRequest";

export type PartnerRefundRequestFormState =
  | null
  | { ok: true; message: string; duplicate: boolean }
  | {
      ok: false;
      error: string;
      fieldErrors?: { reason?: string; partnerNote?: string };
    };

export async function createPartnerRefundRequestAction(
  _prev: PartnerRefundRequestFormState,
  formData: FormData
): Promise<PartnerRefundRequestFormState> {
  // Never trust browser money / owner / execution fields.
  void formData.get("amount");
  void formData.get("refundAmount");
  void formData.get("refundAmountCents");
  void formData.get("partnerChargeCents");
  void formData.get("partnerId");
  void formData.get("status");
  void formData.get("creditWallet");
  void formData.get("executeRefund");
  void formData.get("approve");

  const purchaseId = String(formData.get("purchaseId") ?? "").trim();
  const reason = formData.get("reason");
  const partnerNote = formData.get("partnerNote");

  let partner;
  try {
    partner = await requireRole("PARTNER", "/partner/orders");
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
    return {
      ok: false,
      error: "Please sign in again to submit a refund request.",
    };
  }

  if (!purchaseId) {
    return {
      ok: false,
      error: "This purchase is unavailable for a refund request.",
    };
  }

  try {
    const result = await createPartnerRefundRequest({
      partnerUserId: partner.id,
      purchaseId,
      reason,
      partnerNote,
    });
    revalidatePath("/partner/orders");
    return {
      ok: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? "A refund request is already open for this eSIM."
        : "Refund requested. MAP eSIM will review the order before any refund.",
    };
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
    if (error instanceof PartnerRefundRequestError) {
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
          fieldErrors: { partnerNote: error.message },
        };
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        "Refund requests are temporarily unavailable. Please try again shortly.",
    };
  }
}
