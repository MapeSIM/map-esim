"use server";

import { requireRole } from "@/app/lib/auth/session";
import {
  getPartnerShareBranding,
  updatePartnerShareBranding,
} from "@/app/lib/partner/partnerShareBranding";
import {
  removePartnerShareLogo,
  uploadPartnerShareLogo,
} from "@/app/lib/partner/partnerShareLogo";
import { PARTNER_LOGO_MAX_BYTES } from "@/app/lib/partner/partnerShareLogoBlob";
import { PARTNER_LOGO_INVALID } from "@/app/lib/partner/partnerShareLogoImage";
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
  void formData.get("pathname");
  void formData.get("logoUrl");

  const result = await updatePartnerShareBranding(user.id, {
    companyName: formString(formData, "companyName"),
    supportEmail: formString(formData, "supportEmail"),
    websiteUrl: formString(formData, "websiteUrl"),
    buttonBackground: formString(formData, "buttonBackground"),
    buttonTextColor: formString(formData, "buttonTextColor"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, branding: result.branding, saved: true };
}

export async function uploadPartnerShareLogoAction(
  formData: FormData
): Promise<PartnerShareBrandingActionState> {
  const user = await requireRole("PARTNER");
  void formData.get("partnerId");
  void formData.get("pathname");

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, error: PARTNER_LOGO_INVALID };
  }
  if (file.size > PARTNER_LOGO_MAX_BYTES) {
    return { ok: false, error: PARTNER_LOGO_INVALID };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadPartnerShareLogo({
    partnerUserId: user.id,
    bytes,
    filename: file.name,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, branding: result.branding, saved: true };
}

export async function removePartnerShareLogoAction(): Promise<PartnerShareBrandingActionState> {
  const user = await requireRole("PARTNER");
  const result = await removePartnerShareLogo({ partnerUserId: user.id });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, branding: result.branding, saved: true };
}
