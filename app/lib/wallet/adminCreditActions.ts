"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminWalletCreditError,
  creditCustomerWalletByAdmin,
} from "@/app/lib/wallet/adminCredit";
import type { AdminWalletCreditActionState } from "@/app/lib/wallet/adminCreditFormState";
import {
  parseAdminCreditInternalReference,
  parseAdminCreditReason,
  parseUsdAmountToCents,
} from "@/app/lib/wallet/amount";

function buildSuccessPath(result: {
  customerUserId: string;
  transactionId: string;
}): string {
  // Money values must never be taken from the URL — success page loads them from DB.
  const params = new URLSearchParams({
    tx: result.transactionId,
  });
  return `/admin/customers/${encodeURIComponent(result.customerUserId)}/wallet/credit/success?${params.toString()}`;
}

export async function creditCustomerWalletAction(
  _prev: AdminWalletCreditActionState,
  formData: FormData
): Promise<AdminWalletCreditActionState> {
  const admin = await requireRole("ADMIN");

  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const amountRaw = formData.get("amount");
  const reasonRaw = formData.get("reason");
  const referenceRaw = formData.get("internalReference");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";

  if (!customerUserId || customerUserId.length > 64) {
    return { ok: false, error: "Customer is unavailable." };
  }

  if (!confirmed) {
    return {
      ok: false,
      fieldErrors: {
        confirm: "Confirm that you verified the customer and amount.",
      },
      error: "Confirmation is required before crediting the wallet.",
    };
  }

  const amountParsed = parseUsdAmountToCents(amountRaw);
  if (!amountParsed.ok) {
    return {
      ok: false,
      fieldErrors: { amount: amountParsed.error },
      error: amountParsed.error,
    };
  }

  const reasonParsed = parseAdminCreditReason(reasonRaw);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      fieldErrors: { reason: reasonParsed.error },
      error: reasonParsed.error,
    };
  }

  const referenceParsed = parseAdminCreditInternalReference(referenceRaw);
  if (!referenceParsed.ok) {
    return {
      ok: false,
      fieldErrors: { internalReference: referenceParsed.error },
      error: referenceParsed.error,
    };
  }

  let result;
  try {
    result = await creditCustomerWalletByAdmin({
      adminUserId: admin.id,
      customerUserId,
      amountCents: amountParsed.cents,
      reason: reasonParsed.reason,
      internalReference: referenceParsed.reference,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof AdminWalletCreditError) {
      if (error.code === "INVALID_AMOUNT") {
        return {
          ok: false,
          fieldErrors: { amount: error.message },
          error: error.message,
        };
      }
      return { ok: false, error: error.message };
    }

    return {
      ok: false,
      error: "Wallet credit is temporarily unavailable. Please try again shortly.",
    };
  }

  redirect(buildSuccessPath(result));
}
