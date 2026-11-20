/**
 * Admin Partner Public API access controls (per-partner + helpers).
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { findActiveAdminActor } from "@/app/lib/auth/adminAccess";
import { isPartnerPublicApiGloballyPaused } from "@/app/lib/partnerApiAuth";

export const PARTNER_API_ACCESS_CHANGED_AUDIT = "partner.api_access_changed";

/** Ensure OperationalControl row exists so Admin master switch can toggle it. */
export async function ensurePartnerPublicApiControlRow(): Promise<void> {
  try {
    await prisma.operationalControl.upsert({
      where: { key: "PARTNER_PUBLIC_API" },
      create: {
        key: "PARTNER_PUBLIC_API",
        paused: false,
        reason: null,
      },
      update: {},
    });
  } catch {
    // Ignore — auth fail-closed / admin toggle will surface errors.
  }
}

export async function setPartnerApiEnabled(options: {
  adminUserId: string;
  partnerId: string;
  enabled: boolean;
}): Promise<{ ok: true; apiEnabled: boolean } | { ok: false; error: string }> {
  const admin = await findActiveAdminActor(options.adminUserId);
  if (!admin) {
    return { ok: false, error: "Admin session is unavailable." };
  }
  const partnerId = options.partnerId.trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const updated = await prisma.partnerProfile.updateMany({
    where: { id: partnerId },
    data: { apiEnabled: options.enabled === true },
  });
  if (updated.count !== 1) {
    return { ok: false, error: "Partner not found." };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: PARTNER_API_ACCESS_CHANGED_AUDIT,
    targetType: "PartnerProfile",
    targetId: partnerId,
    metadata: { apiEnabled: options.enabled === true },
  });

  return { ok: true, apiEnabled: options.enabled === true };
}

export async function getPartnerApiAccessSnapshot(partnerId: string): Promise<{
  apiEnabled: boolean;
  globalPaused: boolean;
} | null> {
  const id = partnerId.trim();
  if (!id) return null;
  const row = await prisma.partnerProfile.findUnique({
    where: { id },
    select: { apiEnabled: true },
  });
  if (!row) return null;
  return {
    apiEnabled: row.apiEnabled === true,
    globalPaused: await isPartnerPublicApiGloballyPaused(),
  };
}
