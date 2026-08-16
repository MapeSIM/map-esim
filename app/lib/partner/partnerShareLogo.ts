/**
 * Partner share-logo upload / replace / remove via Vercel Blob.
 * Pathnames are server-generated. Raw Blob tokens are never returned or audited.
 */
import "server-only";

import { randomBytes } from "node:crypto";
import { del, put } from "@vercel/blob";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { PARTNER_SHARE_BRANDING_UNAVAILABLE } from "@/app/lib/partner/partnerShareBranding";
import type { PartnerShareBrandingFields } from "@/app/lib/partner/partnerShareBrandingValidate";
import {
  PARTNER_LOGO_BLOB_TOKEN_ENV,
  buildPartnerLogoBlobPathname,
  isOwnedPartnerLogoBlobUrl,
} from "@/app/lib/partner/partnerShareLogoBlob";
import {
  PARTNER_LOGO_INVALID,
  PARTNER_LOGO_UNAVAILABLE,
  preparePartnerLogoWebp,
} from "@/app/lib/partner/partnerShareLogoImage";

export const PARTNER_SHARE_LOGO_UPDATED_AUDIT = "partner.share_logo_updated";

export type PartnerLogoBlobStore = {
  put(input: {
    pathname: string;
    body: Buffer;
    contentType: "image/webp";
  }): Promise<{ url: string }>;
  del(url: string): Promise<void>;
};

export type PartnerShareLogoResult =
  | { ok: true; branding: PartnerShareBrandingFields }
  | { ok: false; error: string };

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

export function isPartnerLogoBlobWriteConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return Boolean((env[PARTNER_LOGO_BLOB_TOKEN_ENV] ?? "").trim());
}

async function vercelBlobStore(): Promise<PartnerLogoBlobStore> {
  return {
    async put(input) {
      const result = await put(input.pathname, input.body, {
        access: "public",
        addRandomSuffix: false,
        contentType: input.contentType,
      });
      return { url: result.url };
    },
    async del(url) {
      await del(url);
    },
  };
}

async function loadBrandingRow(partnerId: string) {
  return prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      shareCompanyName: true,
      shareSupportEmail: true,
      shareWebsiteUrl: true,
      shareLogoUrl: true,
      shareButtonBackground: true,
      shareButtonTextColor: true,
    },
  });
}

async function bestEffortDeleteOwnedLogo(options: {
  store: PartnerLogoBlobStore;
  partnerId: string;
  url: string | null;
}): Promise<void> {
  if (!isOwnedPartnerLogoBlobUrl(options.url, options.partnerId)) return;
  try {
    await options.store.del(options.url!);
  } catch {
    // Orphan cleanup is best-effort. Never throw after a successful profile write.
  }
}

/**
 * Upload or replace the Partner share logo.
 * Client-supplied pathnames are ignored. Previous logo is kept until the new
 * upload and profile write both succeed.
 */
export async function uploadPartnerShareLogo(options: {
  partnerUserId: string;
  bytes: Buffer;
  filename?: string | null;
  store?: PartnerLogoBlobStore;
}): Promise<PartnerShareLogoResult> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }

  const prepared = await preparePartnerLogoWebp({
    bytes: options.bytes,
    filename: options.filename,
  });
  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }

  const store = options.store ?? (await vercelBlobStore());
  if (!options.store && !isPartnerLogoBlobWriteConfigured()) {
    return { ok: false, error: PARTNER_LOGO_UNAVAILABLE };
  }

  const fileId = randomBytes(16).toString("hex");
  let pathname: string;
  try {
    pathname = buildPartnerLogoBlobPathname(actor.partnerId, fileId);
  } catch {
    return { ok: false, error: PARTNER_LOGO_UNAVAILABLE };
  }

  const current = await loadBrandingRow(actor.partnerId);
  if (!current) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }
  const previousUrl = current.shareLogoUrl;

  let uploadedUrl: string;
  try {
    const uploaded = await store.put({
      pathname,
      body: prepared.logo.body,
      contentType: prepared.logo.contentType,
    });
    uploadedUrl = (uploaded.url ?? "").trim();
  } catch {
    return { ok: false, error: PARTNER_LOGO_UNAVAILABLE };
  }

  if (!isOwnedPartnerLogoBlobUrl(uploadedUrl, actor.partnerId)) {
    await bestEffortDeleteOwnedLogo({
      store,
      partnerId: actor.partnerId,
      url: uploadedUrl,
    });
    return { ok: false, error: PARTNER_LOGO_UNAVAILABLE };
  }

  try {
    const updated = await prisma.partnerProfile.update({
      where: { id: actor.partnerId },
      data: { shareLogoUrl: uploadedUrl },
      select: {
        shareCompanyName: true,
        shareSupportEmail: true,
        shareWebsiteUrl: true,
        shareLogoUrl: true,
        shareButtonBackground: true,
        shareButtonTextColor: true,
      },
    });

    await writeAuditLog({
      actorUserId: actor.userId,
      action: PARTNER_SHARE_LOGO_UPDATED_AUDIT,
      targetType: "PartnerProfile",
      targetId: actor.partnerId,
      metadata: {
        partnerId: actor.partnerId,
        changedFields: ["logoUrl"],
        method: "upload",
      },
    });

    if (previousUrl && previousUrl !== uploadedUrl) {
      await bestEffortDeleteOwnedLogo({
        store,
        partnerId: actor.partnerId,
        url: previousUrl,
      });
    }

    return { ok: true, branding: rowToFields(updated) };
  } catch {
    await bestEffortDeleteOwnedLogo({
      store,
      partnerId: actor.partnerId,
      url: uploadedUrl,
    });
    return { ok: false, error: PARTNER_LOGO_UNAVAILABLE };
  }
}

/** Clear the Partner share logo and restore MAP fallback. */
export async function removePartnerShareLogo(options: {
  partnerUserId: string;
  store?: PartnerLogoBlobStore;
}): Promise<PartnerShareLogoResult> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }

  const current = await loadBrandingRow(actor.partnerId);
  if (!current) {
    return { ok: false, error: PARTNER_SHARE_BRANDING_UNAVAILABLE };
  }

  const previousUrl = current.shareLogoUrl;
  const updated = await prisma.partnerProfile.update({
    where: { id: actor.partnerId },
    data: { shareLogoUrl: null },
    select: {
      shareCompanyName: true,
      shareSupportEmail: true,
      shareWebsiteUrl: true,
      shareLogoUrl: true,
      shareButtonBackground: true,
      shareButtonTextColor: true,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: PARTNER_SHARE_LOGO_UPDATED_AUDIT,
    targetType: "PartnerProfile",
    targetId: actor.partnerId,
    metadata: {
      partnerId: actor.partnerId,
      changedFields: ["logoUrl"],
      method: "remove",
    },
  });

  const store =
    options.store ??
    (isPartnerLogoBlobWriteConfigured() ? await vercelBlobStore() : null);
  if (store) {
    await bestEffortDeleteOwnedLogo({
      store,
      partnerId: actor.partnerId,
      url: previousUrl,
    });
  }

  return { ok: true, branding: rowToFields(updated) };
}

export { PARTNER_LOGO_INVALID, PARTNER_LOGO_UNAVAILABLE };
