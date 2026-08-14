"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  updateWhatsAppSupportConfig,
  type WhatsAppSupportMutationResult,
} from "@/app/lib/admin/whatsappSupport";

export type WhatsAppSupportFormState = WhatsAppSupportMutationResult | null;

export async function saveWhatsAppSupportConfigAction(
  _prev: WhatsAppSupportFormState,
  formData: FormData
): Promise<WhatsAppSupportFormState> {
  const admin = await requireRole("ADMIN");
  const result = await updateWhatsAppSupportConfig({
    adminUserId: admin.id,
    enabled: formData.get("enabled"),
    phone: formData.get("phone"),
    message: formData.get("message"),
    expectedVersion: (() => {
      const raw = String(formData.get("expectedVersion") ?? "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
  });
  if (result.ok) {
    revalidatePath("/admin/operations");
  }
  return result;
}
