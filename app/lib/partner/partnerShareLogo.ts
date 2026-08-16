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
  PARTNER_LOGO_BLOB_OIDC_ENV,
  PARTNER_LOGO_BLOB_PREFIX,
  PARTNER_LOGO_BLOB_STORE_ID_ENV,
  PARTNER_LOGO_BLOB_TOKEN_ENV,
  buildPartnerLogoBlobPathname,
  isOwnedPartnerLogoBlobUrl,
  partnerLogoPathnamePrefix,
} from "@/app/lib/partner/partnerShareLogoBlob";
import {
  PARTNER_LOGO_INVALID,
  PARTNER_LOGO_UNAVAILABLE,
  preparePartnerLogoWebp,
} from "@/app/lib/partner/partnerShareLogoImage";
import {
  PARTNER_LOGO_STAGE,
  safePartnerLogoStageMeta,
  type PartnerLogoStage,
} from "@/app/lib/partner/partnerShareLogoStages";

export const PARTNER_SHARE_LOGO_UPDATED_AUDIT = "partner.share_logo_updated";
export const PARTNER_SHARE_LOGO_UPLOAD_FAILED_AUDIT =
  "partner.share_logo_upload_failed";

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
  | { ok: false; error: string; stage: PartnerLogoStage };

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
  if ((env[PARTNER_LOGO_BLOB_TOKEN_ENV] ?? "").trim()) return true;
  return Boolean(
    (env[PARTNER_LOGO_BLOB_STORE_ID_ENV] ?? "").trim() &&
      (env[PARTNER_LOGO_BLOB_OIDC_ENV] ?? "").trim()
  );
}

function blobWriteOptions(): { token?: string } {
  const token = (process.env[PARTNER_LOGO_BLOB_TOKEN_ENV] ?? "").trim();
  return token ? { token } : {};
}

function logoBodyForPut(body: Buffer, contentType: "image/webp"): Blob {
  const bytes = new Uint8Array(body);
  return new Blob([bytes], { type: contentType });
}

async function vercelBlobStore(): Promise<PartnerLogoBlobStore> {
  const auth = blobWriteOptions();
  return {
    async put(input) {
      const result = await put(
        input.pathname,
        logoBodyForPut(input.body, input.contentType),
        {
          access: "public",
          addRandomSuffix: false,
          contentType: input.contentType,
          ...auth,
        }
      );
      return { url: result.url };
    },
    async del(url) {
      await del(url, auth);
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

async function recordLogoStageFailure(options: {
  actorUserId?: string | null;
  partnerId?: string | null;
  stage: PartnerLogoStage;
  error: string;
  contentType?: string | null;
  inputBytes?: number | null;
  processedBytes?: number | null;
}): Promise<PartnerShareLogoResult> {
  await writeAuditLog({
    actorUserId: options.actorUserId || null,
    action: PARTNER_SHARE_LOGO_UPLOAD_FAILED_AUDIT,
    targetType: "PartnerProfile",
    targetId: options.partnerId || null,
    metadata: safePartnerLogoStageMeta({
      stage: options.stage,
      partnerId: options.partnerId ?? null,
      contentType: options.contentType ?? null,
      inputBytes: options.inputBytes ?? null,
      processedBytes: options.processedBytes ?? null,
      pathnamePrefix: PARTNER_LOGO_BLOB_PREFIX,
    }),
  });
  return { ok: false, error: options.error, stage: options.stage };
}

async function bestEffortDeleteOwnedLogo(options: {
  store: PartnerLogoBlobStore;
  partnerId: string;
  url: string | null;
}): Promise<boolean> {
  if (!isOwnedPartnerLogoBlobUrl(options.url, options.partnerId)) return true;
  try {
    await options.store.del(options.url!);
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload or replace the Partner share logo.
 * Client-supplied pathnames are ignored. Previous logo is kept until the new
 * upload and profile write both succeed.
 *
 * Explicit BLOB_READ_WRITE_TOKEN is passed to put()/del() so the documented
 * `token` option wins over Vercel OIDC when both BLOB_STORE_ID and a runtime
 * OIDC token are present.
 */
export async function uploadPartnerShareLogo(options: {
  partnerUserId: string;
  bytes: Buffer;
  filename?: string | null;
  store?: PartnerLogoBlobStore;
}): Promise<PartnerShareLogoResult> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return recordLogoStageFailure({
      stage: PARTNER_LOGO_STAGE.AUTH_FAILED,
      error: PARTNER_SHARE_BRANDING_UNAVAILABLE,
    });
  }

  const prepared = await preparePartnerLogoWebp({
    bytes: options.bytes,
    filename: options.filename,
  });
  if (!prepared.ok) {
    return recordLogoStageFailure({
      actorUserId: actor.userId,
      partnerId: actor.partnerId,
      stage: prepared.stage,
      error: prepared.error,
      contentType: null,
      inputBytes: options.bytes.length,
    });
  }

  const store = options.store ?? (await vercelBlobStore());
  if (!options.store && !isPartnerLogoBlobWriteConfigured()) {
    return recordLogoStageFailure({
      actorUserId: actor.userId,
      partnerId: actor.partnerId,
      stage: PARTNER_LOGO_STAGE.BLOB_CONFIG_MISSING,
      error: PARTNER_LOGO_UNAVAILABLE,
      contentType: prepared.logo.contentType,
      inputBytes: options.bytes.length,
      processedBytes: prepared.logo.body.length,
    });
  }

  const fileId = randomBytes(16).toString("hex");
  let pathname: string;
  try {
    pathname = buildPartnerLogoBlobPathname(actor.partnerId, fileId);
  } catch {
    return recordLogoStageFailure({
      actorUserId: actor.userId,
      partnerId: actor.partnerId,
      stage: PARTNER_LOGO_STAGE.BLOB_PUT_FAILED,
      error: PARTNER_LOGO_UNAVAILABLE,
      contentType: prepared.logo.contentType,
      inputBytes: options.bytes.length,
      processedBytes: prepared.logo.body.length,
    });
  }

  const current = await loadBrandingRow(actor.partnerId);
  if (!current) {
    return recordLogoStageFailure({
      actorUserId: actor.userId,
      partnerId: actor.partnerId,
      stage: PARTNER_LOGO_STAGE.AUTH_FAILED,
      error: PARTNER_SHARE_BRANDING_UNAVAILABLE,
      contentType: prepared.logo.contentType,
      inputBytes: options.bytes.length,
      processedBytes: prepared.logo.body.length,
    });
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
    return recordLogoStageFailure({
      actorUserId: actor.userId,
      partnerId: actor.partnerId,
      stage: PARTNER_LOGO_STAGE.BLOB_PUT_FAILED,
      error: PARTNER_LOGO_UNAVAILABLE,
      contentType: prepared.logo.contentType,
      inputBytes: options.bytes.length,
      processedBytes: prepared.logo.body.length,
    });
  }

  if (!isOwnedPartnerLogoBlobUrl(uploadedUrl, actor.partnerId)) {
    await bestEffortDeleteOwnedLogo({
      store,
      partnerId: actor.partnerId,
      url: uploadedUrl,
    });
    return recordLogoStageFailure({
      actorUserId: actor.userId,
      partnerId: actor.partnerId,
      stage: PARTNER_LOGO_STAGE.BLOB_URL_REJECTED,
      error: PARTNER_LOGO_UNAVAILABLE,
      contentType: prepared.logo.contentType,
      inputBytes: options.bytes.length,
      processedBytes: prepared.logo.body.length,
    });
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
        pathnamePrefix: partnerLogoPathnamePrefix(actor.partnerId),
      },
    });

    if (previousUrl && previousUrl !== uploadedUrl) {
      const cleaned = await bestEffortDeleteOwnedLogo({
        store,
        partnerId: actor.partnerId,
        url: previousUrl,
      });
      if (!cleaned) {
        await writeAuditLog({
          actorUserId: actor.userId,
          action: PARTNER_SHARE_LOGO_UPLOAD_FAILED_AUDIT,
          targetType: "PartnerProfile",
          targetId: actor.partnerId,
          metadata: safePartnerLogoStageMeta({
            stage: PARTNER_LOGO_STAGE.CLEANUP_FAILED,
            partnerId: actor.partnerId,
            pathnamePrefix: PARTNER_LOGO_BLOB_PREFIX,
          }),
        });
      }
    }

    return { ok: true, branding: rowToFields(updated) };
  } catch {
    const cleaned = await bestEffortDeleteOwnedLogo({
      store,
      partnerId: actor.partnerId,
      url: uploadedUrl,
    });
    if (!cleaned) {
      await writeAuditLog({
        actorUserId: actor.userId,
        action: PARTNER_SHARE_LOGO_UPLOAD_FAILED_AUDIT,
        targetType: "PartnerProfile",
        targetId: actor.partnerId,
        metadata: safePartnerLogoStageMeta({
          stage: PARTNER_LOGO_STAGE.CLEANUP_FAILED,
          partnerId: actor.partnerId,
          pathnamePrefix: PARTNER_LOGO_BLOB_PREFIX,
        }),
      });
    }
    return recordLogoStageFailure({
      actorUserId: actor.userId,
      partnerId: actor.partnerId,
      stage: PARTNER_LOGO_STAGE.PROFILE_UPDATE_FAILED,
      error: PARTNER_LOGO_UNAVAILABLE,
      contentType: prepared.logo.contentType,
      inputBytes: options.bytes.length,
      processedBytes: prepared.logo.body.length,
    });
  }
}

/** Clear the Partner share logo and restore MAP fallback. */
export async function removePartnerShareLogo(options: {
  partnerUserId: string;
  store?: PartnerLogoBlobStore;
}): Promise<PartnerShareLogoResult> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return {
      ok: false,
      error: PARTNER_SHARE_BRANDING_UNAVAILABLE,
      stage: PARTNER_LOGO_STAGE.AUTH_FAILED,
    };
  }

  const current = await loadBrandingRow(actor.partnerId);
  if (!current) {
    return {
      ok: false,
      error: PARTNER_SHARE_BRANDING_UNAVAILABLE,
      stage: PARTNER_LOGO_STAGE.AUTH_FAILED,
    };
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
    const cleaned = await bestEffortDeleteOwnedLogo({
      store,
      partnerId: actor.partnerId,
      url: previousUrl,
    });
    if (!cleaned) {
      await writeAuditLog({
        actorUserId: actor.userId,
        action: PARTNER_SHARE_LOGO_UPLOAD_FAILED_AUDIT,
        targetType: "PartnerProfile",
        targetId: actor.partnerId,
        metadata: safePartnerLogoStageMeta({
          stage: PARTNER_LOGO_STAGE.CLEANUP_FAILED,
          partnerId: actor.partnerId,
          pathnamePrefix: PARTNER_LOGO_BLOB_PREFIX,
        }),
      });
    }
  }

  return { ok: true, branding: rowToFields(updated) };
}

export { PARTNER_LOGO_INVALID, PARTNER_LOGO_UNAVAILABLE };
