"use server";

import { revalidatePath } from "next/cache";
import { actorHasAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { voidPendingPartnerEsimPurchaseReservation } from "@/app/lib/admin/partnerPendingVoid";
import { requireRole } from "@/app/lib/auth/session";

export type VoidPendingPartnerPurchaseFormState =
  | null
  | { ok: true; message: string }
  | { ok: false; error: string };

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

/**
 * Void an unprovisioned Partner eSIM wallet hold.
 * Returns inline form state (useActionState) — mirrors customer void UX.
 */
export async function voidPendingPartnerPurchaseAction(
  _prev: VoidPendingPartnerPurchaseFormState,
  formData: FormData
): Promise<VoidPendingPartnerPurchaseFormState> {
  try {
    const admin = await requireRole("ADMIN");
    const canWallet = await actorHasAdminPermission(admin.id, "WALLET_ADJUST");
    const canPartners = await actorHasAdminPermission(
      admin.id,
      "PARTNERS_MANAGE"
    );
    if (!canWallet && !canPartners) {
      return {
        ok: false,
        error:
          "You need Wallet adjustments (WALLET_ADJUST) or Partners (PARTNERS_MANAGE) permission to void partner reservations.",
      };
    }

    const partnerId = String(formData.get("partnerId") ?? "").trim();
    const partnerEsimPurchaseId = String(
      formData.get("partnerEsimPurchaseId") ?? ""
    ).trim();
    const confirmed = formData.get("confirm") === "on";

    if (!partnerId || partnerId.length > 64) {
      return { ok: false, error: "Partner is unavailable." };
    }
    if (!partnerEsimPurchaseId || partnerEsimPurchaseId.length > 64) {
      return { ok: false, error: "Purchase is unavailable." };
    }
    if (!confirmed) {
      return {
        ok: false,
        error: "Confirm the checkbox before voiding a pending reservation.",
      };
    }

    const result = await voidPendingPartnerEsimPurchaseReservation({
      adminUserId: admin.id,
      partnerId,
      partnerEsimPurchaseId,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const partnerPath = `/admin/partners/${encodeURIComponent(partnerId)}`;
    revalidatePath(partnerPath);
    revalidatePath("/admin/reconciliation");

    return {
      ok: true,
      message: result.alreadyReleased
        ? "Partner reservation was already released."
        : "Partner reservation voided and wallet balance restored.",
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      ok: false,
      error:
        "Partner reservation void is temporarily unavailable. Please try again shortly.",
    };
  }
}
