"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  AdminPackageAssignmentError,
  confirmAdminPackageAssignment,
  prepareAdminPackageAssignment,
} from "@/app/lib/esim/adminPackageAssignment";
import type { AdminPackageAssignmentActionState } from "@/app/lib/esim/adminPackageAssignmentFormState";
import {
  listAdminAssignmentOffers,
  type AdminOfferOption,
} from "@/app/lib/esim/adminPackageAssignmentRead";
import {
  parseAssignmentConfirmPhrase,
  parseAssignmentIdempotencyKey,
  parseAssignmentInternalReference,
  parseAssignmentReason,
} from "@/app/lib/esim/assignmentValidation";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export async function loadAdminAssignmentOffersAction(
  destinationCode: string
): Promise<AdminOfferOption[]> {
  await requireRole("ADMIN");
  return listAdminAssignmentOffers(destinationCode);
}

function reviewPath(customerUserId: string, assignmentId: string): string {
  const params = new URLSearchParams({ assignment: assignmentId });
  return `/admin/customers/${encodeURIComponent(customerUserId)}/esim/assign/review?${params.toString()}`;
}

function successPath(customerUserId: string, assignmentId: string): string {
  const params = new URLSearchParams({ assignment: assignmentId });
  return `/admin/customers/${encodeURIComponent(customerUserId)}/esim/assign/success?${params.toString()}`;
}

export async function prepareAdminPackageAssignmentAction(
  _prev: AdminPackageAssignmentActionState,
  formData: FormData
): Promise<AdminPackageAssignmentActionState> {
  const admin = await requireRole("ADMIN");

  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const offerId = normalizeOfferId(formData.get("offerId"));
  const countryHint = sanitizeCountryHint(formData.get("destinationCode"));
  const reasonParsed = parseAssignmentReason(formData.get("reason"));
  const referenceParsed = parseAssignmentInternalReference(
    formData.get("internalReference")
  );
  const idempotencyParsed = parseAssignmentIdempotencyKey(
    formData.get("idempotencyKey")
  );

  if (!customerUserId || customerUserId.length > 64) {
    return { ok: false, error: "Customer is unavailable." };
  }

  if (!offerId) {
    return {
      ok: false,
      fieldErrors: { offerId: "Select an available package." },
      error: "Select an available package.",
    };
  }

  if (!countryHint) {
    return {
      ok: false,
      fieldErrors: { destination: "Select a destination." },
      error: "Select a destination.",
    };
  }

  if (!reasonParsed.ok) {
    return {
      ok: false,
      fieldErrors: { reason: reasonParsed.error },
      error: reasonParsed.error,
    };
  }

  if (!referenceParsed.ok) {
    return {
      ok: false,
      fieldErrors: { internalReference: referenceParsed.error },
      error: referenceParsed.error,
    };
  }

  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  // Ignore any browser-supplied price/name/data fields entirely.
  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("planName");
  void formData.get("dataAllowance");
  void formData.get("validity");

  let result;
  try {
    result = await prepareAdminPackageAssignment({
      adminUserId: admin.id,
      customerUserId,
      offerId,
      countryHint,
      reason: reasonParsed.value,
      internalReference: referenceParsed.value,
      idempotencyKey: idempotencyParsed.value,
    });
  } catch (error) {
    if (error instanceof AdminPackageAssignmentError) {
      if (error.code === "OFFER_UNAVAILABLE") {
        return {
          ok: false,
          fieldErrors: { offerId: error.message },
          error: error.message,
        };
      }
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        "Package assignment is temporarily unavailable. Please try again shortly.",
    };
  }

  redirect(reviewPath(result.customerUserId, result.assignmentId));
}

export async function confirmAdminPackageAssignmentAction(
  _prev: AdminPackageAssignmentActionState,
  formData: FormData
): Promise<AdminPackageAssignmentActionState> {
  const admin = await requireRole("ADMIN");

  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const assignmentId = String(formData.get("assignmentId") ?? "").trim();
  const idempotencyParsed = parseAssignmentIdempotencyKey(
    formData.get("idempotencyKey")
  );
  const confirmed = formData.get("confirm") === "on";
  const phraseParsed = parseAssignmentConfirmPhrase(
    formData.get("confirmPhrase")
  );

  if (!customerUserId || customerUserId.length > 64 || !assignmentId) {
    return { ok: false, error: "This assignment is unavailable." };
  }

  if (!confirmed) {
    return {
      ok: false,
      fieldErrors: {
        confirm: "Confirm that you reviewed this company-funded assignment.",
      },
      error: "Confirmation is required before creating a provider eSIM order.",
    };
  }

  if (!phraseParsed.ok) {
    return {
      ok: false,
      fieldErrors: { confirmPhrase: phraseParsed.error },
      error: phraseParsed.error,
    };
  }

  if (!idempotencyParsed.ok) {
    return { ok: false, error: idempotencyParsed.error };
  }

  // Ignore any browser-supplied money/package fields.
  void formData.get("price");
  void formData.get("priceUSD");
  void formData.get("walletBalance");

  let result;
  try {
    result = await confirmAdminPackageAssignment({
      adminUserId: admin.id,
      customerUserId,
      assignmentId,
      idempotencyKey: idempotencyParsed.value,
    });
  } catch (error) {
    if (error instanceof AdminPackageAssignmentError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error:
        "Package assignment is temporarily unavailable. Please try again shortly.",
    };
  }

  if (result.status !== "COMPLETED" || !result.orderId) {
    return {
      ok: false,
      error:
        "The provider result is uncertain. Do not submit again. Contact support for reconciliation.",
    };
  }

  redirect(successPath(result.customerUserId, result.assignmentId));
}
