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

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function logPartnerBrandingActionError(scope: string, error: unknown): void {
  const err = error instanceof Error ? error : null;
  const prismaCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  console.error("PARTNER_SHARE_BRANDING_ACTION_FAILED", {
    scope,
    name: (err?.name ?? "unknown").slice(0, 80),
    message: (err?.message ?? "unknown").slice(0, 300),
    prismaCode: prismaCode.slice(0, 32),
  });
}

function brandingActionFailed(): PartnerShareBrandingActionState {
  return {
    ok: false,
    error: "Share branding could not be saved. Please try again.",
  };
}

export async function getPartnerShareBrandingAction(): Promise<PartnerShareBrandingActionState> {
  try {
    const user = await requireRole("PARTNER");
    const result = await getPartnerShareBranding(user.id);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, branding: result.branding, saved: false };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    logPartnerBrandingActionError("get", error);
    return brandingActionFailed();
  }
}

export async function updatePartnerShareBrandingAction(
  _prev: PartnerShareBrandingActionState,
  formData: FormData
): Promise<PartnerShareBrandingActionState> {
  try {
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
  } catch (error) {
    if (isRedirectError(error)) throw error;
    logPartnerBrandingActionError("update", error);
    return brandingActionFailed();
  }
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
