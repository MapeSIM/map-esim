"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  cleanupPreviewWalletFinalizeUatFixtures,
  runPreviewWalletFinalizeUat,
  type PreviewWalletFinalizeUatResult,
  type PreviewWalletFinalizeUatScenario,
} from "@/app/lib/esim/previewWalletFinalizeUat";
import { assertPreviewWalletFinalizeUatGate } from "@/app/lib/esim/previewWalletFinalizeUatGate";

export type WalletFinalizeUatActionState = {
  ok: boolean;
  error?: string;
  result?: PreviewWalletFinalizeUatResult;
  cleanup?: {
    purchasesDeleted: number;
    ordersDeleted: number;
    usersDeleted: number;
    debitsDeleted: number;
  };
};

function parseScenario(raw: FormDataEntryValue | null): PreviewWalletFinalizeUatScenario {
  const v = String(raw ?? "").trim();
  if (
    v === "happy" ||
    v === "replay" ||
    v === "post_commit_promo_failure" ||
    v === "critical_failure"
  ) {
    return v;
  }
  throw new Error("Invalid UAT scenario");
}

export async function runPreviewWalletFinalizeUatAction(
  _prev: WalletFinalizeUatActionState,
  formData: FormData
): Promise<WalletFinalizeUatActionState> {
  try {
    assertPreviewWalletFinalizeUatGate();
    const admin = await requireRole("ADMIN", "/admin/uat/wallet-finalize");
    const scenario = parseScenario(formData.get("scenario"));
    const existingPurchaseId = String(
      formData.get("existingPurchaseId") ?? ""
    ).trim();

    const result = await runPreviewWalletFinalizeUat({
      adminUserId: admin.id,
      scenario,
      existingPurchaseId: existingPurchaseId || null,
    });

    revalidatePath("/admin/uat/wallet-finalize");
    return { ok: result.pass, result, error: result.pass ? undefined : "UAT assertions failed" };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 240)
          : "UAT action failed",
    };
  }
}

export async function cleanupPreviewWalletFinalizeUatAction(
  _prev: WalletFinalizeUatActionState,
  _formData: FormData
): Promise<WalletFinalizeUatActionState> {
  try {
    assertPreviewWalletFinalizeUatGate();
    await requireRole("ADMIN", "/admin/uat/wallet-finalize");
    const cleanup = await cleanupPreviewWalletFinalizeUatFixtures();
    revalidatePath("/admin/uat/wallet-finalize");
    return { ok: true, cleanup };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message.slice(0, 240)
          : "UAT cleanup failed",
    };
  }
}
