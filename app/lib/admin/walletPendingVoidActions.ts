"use server";

import { revalidatePath } from "next/cache";
import {
  actorHasAdminPermission,
} from "@/app/lib/admin/adminPermissionAccess";
import { voidPendingWalletEsimPurchaseReservation } from "@/app/lib/admin/walletPendingVoid";
import { requireRole } from "@/app/lib/auth/session";

export type VoidPendingWalletFormState =
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

function safeCustomerPaths(customerUserId: string, returnToRaw: string): {
  customerPath: string;
  ledgerPath: string | null;
} {
  const customerPath = `/admin/customers/${encodeURIComponent(customerUserId)}`;
  const returnTo = (returnToRaw ?? "").trim();
  if (
    returnTo.startsWith(customerPath) &&
    !returnTo.includes("//") &&
    !returnTo.includes("\\") &&
    returnTo.length <= 512
  ) {
    const pathOnly = returnTo.split("?")[0] ?? returnTo;
    if (pathOnly.endsWith("/wallet") || pathOnly.includes("/wallet")) {
      return { customerPath, ledgerPath: pathOnly };
    }
  }
  return { customerPath, ledgerPath: null };
}

/**
 * Void a stuck pending WALLET_ESIM_PURCHASE debit.
 * Returns inline form state (useActionState) — never silent-redirects on
 * permission denial or validation errors.
 */
export async function voidPendingWalletReservationAction(
  _prev: VoidPendingWalletFormState,
  formData: FormData
): Promise<VoidPendingWalletFormState> {
  try {
    const admin = await requireRole("ADMIN");
    const allowed = await actorHasAdminPermission(admin.id, "WALLET_ADJUST");
    if (!allowed) {
      return {
        ok: false,
        error:
          "You need Wallet adjustments (WALLET_ADJUST) permission to void pending reservations.",
      };
    }

    const customerUserId = String(formData.get("customerUserId") ?? "").trim();
    const walletTransactionId = String(
      formData.get("walletTransactionId") ?? ""
    ).trim();
    const confirmed = formData.get("confirm") === "on";

    if (!customerUserId || customerUserId.length > 64) {
      return { ok: false, error: "Customer is unavailable." };
    }
    if (!confirmed) {
      return {
        ok: false,
        error: "Confirm the checkbox before voiding a pending reservation.",
      };
    }

    const result = await voidPendingWalletEsimPurchaseReservation({
      adminUserId: admin.id,
      customerUserId,
      walletTransactionId,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const { customerPath, ledgerPath } = safeCustomerPaths(
      customerUserId,
      String(formData.get("returnTo") ?? "")
    );
    revalidatePath(customerPath);
    if (ledgerPath) revalidatePath(ledgerPath);
    else revalidatePath(`${customerPath}/wallet`);

    return {
      ok: true,
      message: result.alreadyReleased
        ? "Pending wallet reservation was already released."
        : "Pending wallet reservation voided and balance restored.",
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      ok: false,
      error:
        "Wallet reservation void is temporarily unavailable. Please try again shortly.",
    };
  }
}
