"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import { prisma } from "@/app/lib/db";
import {
  changePartnerDiscount,
  createPartner,
  disablePartner,
  reactivatePartner,
} from "@/app/lib/partner/partners";
import type {
  PartnerWalletActionState,
  PartnersFormState,
} from "@/app/lib/partner/partnersFormState";
import {
  PartnerWalletCreditError,
  PartnerWalletDebitError,
  creditPartnerWalletByAdmin,
  debitPartnerWalletByAdmin,
} from "@/app/lib/partner/partnerWallet";
import {
  parsePartnerAdminCreditAmountToCents,
  parsePartnerAdminDebitAmountToCents,
} from "@/app/lib/partner/partnerWalletAmount";
import {
  parseAdminCreditInternalReference,
  parseAdminCreditReason,
  parseAdminDebitInternalReference,
  parseAdminDebitReason,
} from "@/app/lib/wallet/amount";

function revalidatePartnerPaths(partnerId: string): void {
  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${partnerId}`);
}

export async function createPartnerAction(
  _prev: PartnersFormState,
  formData: FormData
): Promise<PartnersFormState> {
  const admin = await requireRole("ADMIN");
  const result = await createPartner({
    adminUserId: admin.id,
    name: formData.get("name"),
    email: formData.get("email"),
    discountPercentRaw: formData.get("discountPercent"),
  });
  if (result.ok) {
    revalidatePath("/admin/partners");
    if (result.partnerId) {
      revalidatePath(`/admin/partners/${result.partnerId}`);
    }
  }
  return result;
}

export async function changePartnerDiscountAction(
  _prev: PartnersFormState,
  formData: FormData
): Promise<PartnersFormState> {
  const admin = await requireRole("ADMIN");
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const result = await changePartnerDiscount({
    adminUserId: admin.id,
    partnerId,
    discountPercentRaw: formData.get("discountPercent"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (result.ok && partnerId) {
    revalidatePartnerPaths(partnerId);
  }
  return result;
}

export async function disablePartnerAction(
  _prev: PartnersFormState,
  formData: FormData
): Promise<PartnersFormState> {
  const admin = await requireRole("ADMIN");
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const result = await disablePartner({
    adminUserId: admin.id,
    partnerId,
    expectedVersion: formData.get("expectedVersion"),
    reason: formData.get("reason"),
  });
  if (result.ok && partnerId) {
    revalidatePartnerPaths(partnerId);
  }
  return result;
}

export async function reactivatePartnerAction(
  _prev: PartnersFormState,
  formData: FormData
): Promise<PartnersFormState> {
  const admin = await requireRole("ADMIN");
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const result = await reactivatePartner({
    adminUserId: admin.id,
    partnerId,
    expectedVersion: formData.get("expectedVersion"),
    reason: formData.get("reason"),
  });
  if (result.ok && partnerId) {
    revalidatePartnerPaths(partnerId);
  }
  return result;
}

export async function creditPartnerWalletAction(
  _prev: PartnerWalletActionState,
  formData: FormData
): Promise<PartnerWalletActionState> {
  const admin = await requireRole("ADMIN");

  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const amountRaw = formData.get("amount");
  const reasonRaw = formData.get("reason");
  const referenceRaw = formData.get("internalReference");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";

  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner is unavailable." };
  }

  if (!confirmed) {
    return {
      ok: false,
      fieldErrors: {
        confirm: "Confirm that you verified the partner and amount.",
      },
      error: "Confirmation is required before crediting the wallet.",
    };
  }

  const amountParsed = parsePartnerAdminCreditAmountToCents(amountRaw);
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

  try {
    const result = await creditPartnerWalletByAdmin({
      adminUserId: admin.id,
      partnerId,
      amountCents: amountParsed.cents,
      reason: reasonParsed.reason,
      internalReference: referenceParsed.reference,
      idempotencyKey,
    });

    revalidatePartnerPaths(partnerId);

    return {
      ok: true,
      message: result.duplicate
        ? "Credit already recorded for this request."
        : `Credited ${result.amountLabel} USD. New balance: ${result.balanceLabel} USD.`,
    };
  } catch (error) {
    if (error instanceof PartnerWalletCreditError) {
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
      error:
        "Partner wallet credit is temporarily unavailable. Please try again shortly.",
    };
  }
}

export async function debitPartnerWalletAction(
  _prev: PartnerWalletActionState,
  formData: FormData
): Promise<PartnerWalletActionState> {
  const admin = await requireRole("ADMIN");

  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const amountRaw = formData.get("amount");
  const reasonRaw = formData.get("reason");
  const referenceRaw = formData.get("internalReference");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();
  const confirmed = formData.get("confirm") === "on";

  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner is unavailable." };
  }

  if (!confirmed) {
    return {
      ok: false,
      fieldErrors: {
        confirm: "Confirm that you verified the partner and amount.",
      },
      error: "Confirmation is required before deducting from the wallet.",
    };
  }

  let availableBalanceCents: number | undefined;
  try {
    const profile = await prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      select: {
        walletAccount: { select: { balanceCents: true } },
      },
    });
    availableBalanceCents = profile?.walletAccount?.balanceCents;
  } catch {
    availableBalanceCents = undefined;
  }

  const amountParsed = parsePartnerAdminDebitAmountToCents(
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

  try {
    const result = await debitPartnerWalletByAdmin({
      adminUserId: admin.id,
      partnerId,
      amountCents: amountParsed.cents,
      reason: reasonParsed.reason,
      internalReference: referenceParsed.reference,
      idempotencyKey,
    });

    revalidatePartnerPaths(partnerId);

    return {
      ok: true,
      message: result.duplicate
        ? "Debit already recorded for this request."
        : `Debited ${result.amountLabel} USD. New balance: ${result.balanceLabel} USD.`,
    };
  } catch (error) {
    if (error instanceof PartnerWalletDebitError) {
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
      error:
        "Partner wallet debit is temporarily unavailable. Please try again shortly.",
    };
  }
}
