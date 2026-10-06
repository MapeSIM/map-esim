"use server";

import { revalidatePath } from "next/cache";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { requireRole } from "@/app/lib/auth/session";
import {
  updateSimpaisaWalletOperatorConfig,
  type SimpaisaWalletOperatorMutationResult,
} from "@/app/lib/admin/simpaisaWalletOperatorConfig";

export type SimpaisaWalletOperatorFormState =
  SimpaisaWalletOperatorMutationResult | null;

export async function saveSimpaisaWalletOperatorConfigAction(
  _prev: SimpaisaWalletOperatorFormState,
  formData: FormData
): Promise<SimpaisaWalletOperatorFormState> {
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "SETTINGS_MANAGE");
  const result = await updateSimpaisaWalletOperatorConfig({
    adminUserId: admin.id,
    jazzcashEnabled: formData.get("jazzcashEnabled"),
    easypaisaEnabled: formData.get("easypaisaEnabled"),
    expectedVersion: (() => {
      const raw = String(formData.get("expectedVersion") ?? "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
  });
  if (result.ok) {
    revalidatePath("/admin/operations");
    revalidatePath("/account/esim/buy");
    revalidatePath("/account/wallet/top-up");
    revalidatePath("/partner/catalog");
    revalidatePath("/partner/wallet");
  }
  return result;
}
