"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import {
  AdminWalletDebitError,
  debitCustomerWalletByAdmin,
} from "@/app/lib/wallet/adminDebit";
import type { AdminWalletDebitActionState } from "@/app/lib/wallet/adminDebitFormState";
import {
  parseAdminDebitAmountToCents,
  parseAdminDebitInternalReference,
  parseAdminDebitReason,
} from "@/app/lib/wallet/amount";
import { Role } from "@prisma/client";

function buildSuccessPath(result: {
  customerUserId: string;
  transactionId: string;
}): string {
  // Money values must never be taken from the URL — success page loads them from DB.
  const params = new URLSearchParams({
    tx: result.transactionId,
  });
  return `/admin/customers/${encodeURIComponent(result.customerUserId)}/wallet/debit/success?${params.toString()}`;
}

export async function debitCustomerWalletAction(
  _prev: AdminWalletDebitActionState,
  formData: FormData
): Promise<AdminWalletDebitActionState> {
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
      error: "Confirmation is required before deducting from the wallet.",
    };
  }

  // Read current balance for UX validation; atomic service remains authoritative.
  let availableBalanceCents: number | undefined;
  try {
    const customer = await prisma.user.findFirst({
      where: {
        id: customerUserId,
        role: Role.CUSTOMER,
        deletedAt: null,
      },
      select: {
        walletAccount: {
          select: { balanceCents: true },
        },
      },
    });
    availableBalanceCents = customer?.walletAccount?.balanceCents;
  } catch {
    availableBalanceCents = undefined;
  }

  const amountParsed = parseAdminDebitAmountToCents(
    amountRaw,
    availableBalanceCents
  );
  if (!amountParsed.ok) {
    return {
      ok: false,
      fieldErrors: { amount: amountParsed.error },
      error: amountParsed.error,
    };
  }

  const reasonParsed = parseAdminDebitReason(reasonRaw);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      fieldErrors: { reason: reasonParsed.error },
      error: reasonParsed.error,
    };
  }

  const referenceParsed = parseAdminDebitInternalReference(referenceRaw);
  if (!referenceParsed.ok) {
    return {
      ok: false,
      fieldErrors: { internalReference: referenceParsed.error },
      error: referenceParsed.error,
    };
  }

  let result;
  try {
    result = await debitCustomerWalletByAdmin({
      adminUserId: admin.id,
      customerUserId,
      amountCents: amountParsed.cents,
      reason: reasonParsed.reason,
      internalReference: referenceParsed.reference,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof AdminWalletDebitError) {
      if (
        error.code === "INVALID_AMOUNT" ||
        error.code === "INSUFFICIENT_FUNDS"
      ) {
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
      error: "Wallet debit is temporarily unavailable. Please try again shortly.",
    };
  }

  redirect(buildSuccessPath(result));
}
