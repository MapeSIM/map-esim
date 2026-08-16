"use server";

import { requireRole } from "@/app/lib/auth/session";
import {
  getPartnerShareBranding,
  updatePartnerShareBranding,
} from "@/app/lib/partner/partnerShareBranding";
import type { PartnerShareBrandingFields } from "@/app/lib/partner/partnerShareBrandingValidate";

export type PartnerShareBrandingActionState =
  | { ok: true; branding: PartnerShareBrandingFields; saved: boolean }
  | { ok: false; error: string };

function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function getPartnerShareBrandingAction(): Promise<PartnerShareBrandingActionState> {
  const user = await requireRole("PARTNER");
  const result = await getPartnerShareBranding(user.id);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, branding: result.branding, saved: false };
}

export async function updatePartnerShareBrandingAction(
  _prev: PartnerShareBrandingActionState,
  formData: FormData
): Promise<PartnerShareBrandingActionState> {
  const user = await requireRole("PARTNER");
  void formData.get("partnerId");

  const result = await updatePartnerShareBranding(user.id, {
    companyName: formString(formData, "companyName"),
    supportEmail: formString(formData, "supportEmail"),
    websiteUrl: formString(formData, "websiteUrl"),
    logoUrl: formString(formData, "logoUrl"),
    buttonBackground: formString(formData, "buttonBackground"),
    buttonTextColor: formString(formData, "buttonTextColor"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, branding: result.branding, saved: true };
}
