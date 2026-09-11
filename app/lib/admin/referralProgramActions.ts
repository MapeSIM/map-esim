"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  updateReferralProgramConfig,
  type ReferralProgramMutationResult,
} from "@/app/lib/admin/referralProgramAdmin";

export type ReferralProgramFormState = ReferralProgramMutationResult | null;

export async function saveReferralProgramConfigAction(
  _prev: ReferralProgramFormState,
  formData: FormData
): Promise<ReferralProgramFormState> {
  const admin = await requireRole("ADMIN");
  const result = await updateReferralProgramConfig({
    adminUserId: admin.id,
    enabled: formData.get("enabled"),
    rewardType: formData.get("rewardType"),
    rewardValue: formData.get("rewardValue"),
    minPurchase: formData.get("minPurchase"),
    maxReward: formData.get("maxReward"),
    expectedVersion: (() => {
      const raw = String(formData.get("expectedVersion") ?? "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isInteger(n) ? n : null;
    })(),
  });
  if (result.ok) {
    revalidatePath("/admin/settings");
    revalidatePath("/account");
  }
  return result;
}
