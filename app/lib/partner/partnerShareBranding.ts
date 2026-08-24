/**
 * Partner share-page branding (Phase 3 Slice 3).
 * Branding belongs to PartnerProfile. Empty/invalid fields fall back to MAP eSIM.
 */
import "server-only";

import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  parsePartnerShareBrandingInput,
  publicShareBrandingDto,
  PartnerShareBrandingError,
  type PartnerShareBrandingFields,
  type PartnerShareBrandingInput,
} from "@/app/lib/partner/partnerShareBrandingValidate";

export const PARTNER_SHARE_BRANDING_UPDATED_AUDIT =
  "partner.share_branding_updated";

export const PARTNER_SHARE_BRANDING_UNAVAILABLE =
  "Partner access is unavailable.";

export type GetPartnerShareBrandingResult =
  | { ok: true; branding: PartnerShareBrandingFields }
  | { ok: false; error: string };

export type UpdatePartnerShareBrandingResult =
  | { ok: true; branding: PartnerShareBrandingFields }
  | { ok: false; error: string; code?: string };

const EMPTY_BRANDING: PartnerShareBrandingFields = {
  companyName: null,
  supportEmail: null,
  websiteUrl: null,
  logoUrl: null,
  buttonBackground: null,
  buttonTextColor: null,
};

function rowToFields(row: {
  shareCompanyName: string | null;
  shareSupportEmail: string | null;
  shareWebsiteUrl: string | null;
  shareLogoUrl: string | null;
  shareButtonBackground: string | null;
  shareButtonTextColor: string | null;
}): PartnerShareBrandingFields {
  return {
    companyName: row.shareCompanyName,
    supportEmail: row.shareSupportEmail,
    websiteUrl: row.shareWebsiteUrl,
    logoUrl: row.shareLogoUrl,
    buttonBackground: row.shareButtonBackground,
    buttonTextColor: row.shareButtonTextColor,
  };
}

function changedFieldNames(
  before: PartnerShareBrandingFields,
  after: PartnerShareBrandingFields
): string[] {
  const keys: (keyof PartnerShareBrandingFields)[] = [
    "companyName",
    "supportEmail",
    "websiteUrl",
    "logoUrl",
    "buttonBackground",
    "buttonTextColor",
  ];
  return keys.filter((key) => before[key] !== after[key]);
}

export async function getPartnerShareBranding(
  partnerUserId: string
): Promise<GetPartnerShareBrandingResult> {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }

  const row = await prisma.partnerProfile.findUnique({
    where: { id: actor.partnerId },
    select: {
      shareCompanyName: true,
      shareSupportEmail: true,
      shareWebsiteUrl: true,
      shareLogoUrl: true,
      shareButtonBackground: true,
      shareButtonTextColor: true,
    },
  });
  if (!row) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }

  return { ok: true, branding: rowToFields(row) };
}

export async function updatePartnerShareBranding(
  partnerUserId: string,
  input: PartnerShareBrandingInput
): Promise<UpdatePartnerShareBrandingResult> {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }

  const current = await prisma.partnerProfile.findUnique({
    where: { id: actor.partnerId },
    select: {
      shareCompanyName: true,
      shareSupportEmail: true,
      shareWebsiteUrl: true,
      shareLogoUrl: true,
      shareButtonBackground: true,
      shareButtonTextColor: true,
    },
  });
  if (!current) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }

  let next: PartnerShareBrandingFields;
  try {
    next = parsePartnerShareBrandingInput({
      ...input,
      logoUrl:
        input.logoUrl === undefined ? current.shareLogoUrl : input.logoUrl,
    });
  } catch (err) {
    if (err instanceof PartnerShareBrandingError) {
      return { ok: false, error: err.message, code: err.code };
    }
    return { ok: false, error: "Share branding could not be saved." };
  }

  const before = rowToFields(current);
  const changed = changedFieldNames(before, next);

  try {
    await prisma.partnerProfile.update({
      where: { id: actor.partnerId },
      data: {
        shareCompanyName: next.companyName,
        shareSupportEmail: next.supportEmail,
        shareWebsiteUrl: next.websiteUrl,
        shareLogoUrl: next.logoUrl,
        shareButtonBackground: next.buttonBackground,
        shareButtonTextColor: next.buttonTextColor,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : null;
    const prismaCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    console.error("PARTNER_SHARE_BRANDING_UPDATE_FAILED", {
      name: (err?.name ?? "unknown").slice(0, 80),
      message: (err?.message ?? "unknown").slice(0, 300),
      prismaCode: prismaCode.slice(0, 32),
    });
    return { ok: false, error: "Share branding could not be saved." };
  }

  if (changed.length > 0) {
    await writeAuditLog({
      actorUserId: actor.userId,
      action: PARTNER_SHARE_BRANDING_UPDATED_AUDIT,
      targetType: "PartnerProfile",
      targetId: actor.partnerId,
      metadata: {
        partnerId: actor.partnerId,
        changedFields: changed,
      },
    });
  }

  return { ok: true, branding: next };
}

/**
 * Public allowlisted branding for a token-resolved Partner Order.
 * Never includes partnerId, wallet, discount, or provider fields.
 */
export async function loadPublicShareBrandingForPartner(
  partnerId: string
): Promise<PartnerShareBrandingFields> {
  const id = (partnerId ?? "").trim();
  if (!id || id.length > 64) return EMPTY_BRANDING;

  const row = await prisma.partnerProfile.findUnique({
    where: { id },
    select: {
      shareCompanyName: true,
      shareSupportEmail: true,
      shareWebsiteUrl: true,
      shareLogoUrl: true,
      shareButtonBackground: true,
      shareButtonTextColor: true,
    },
  });
  if (!row) return EMPTY_BRANDING;
  return publicShareBrandingDto(rowToFields(row));
}
