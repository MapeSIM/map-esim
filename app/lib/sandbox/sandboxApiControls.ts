/**
 * Sandbox Partner API enablement — global master + per-partner.
 * Never touches live PartnerProfile / PARTNER_PUBLIC_API.
 */
import "server-only";

import { prisma } from "@/app/lib/db";

export const SANDBOX_SETTINGS_ID = "default";

export type SandboxApiAccessState = {
  globalSandboxApiEnabled: boolean;
  partnerApiEnabled: boolean | null;
  /** True when both global and (if known) partner flags allow API use. */
  allowed: boolean;
};

async function ensureSandboxSettingsRow(): Promise<{
  globalSandboxApiEnabled: boolean;
}> {
  const existing = await prisma.sandboxSettings.findUnique({
    where: { id: SANDBOX_SETTINGS_ID },
    select: { globalSandboxApiEnabled: true },
  });
  if (existing) return existing;
  try {
    return await prisma.sandboxSettings.create({
      data: {
        id: SANDBOX_SETTINGS_ID,
        globalSandboxApiEnabled: true,
      },
      select: { globalSandboxApiEnabled: true },
    });
  } catch {
    const again = await prisma.sandboxSettings.findUnique({
      where: { id: SANDBOX_SETTINGS_ID },
      select: { globalSandboxApiEnabled: true },
    });
    return again ?? { globalSandboxApiEnabled: true };
  }
}

export async function getGlobalSandboxApiEnabled(): Promise<boolean> {
  const row = await ensureSandboxSettingsRow();
  return row.globalSandboxApiEnabled === true;
}

export async function setGlobalSandboxApiEnabled(input: {
  enabled: boolean;
  adminUserId: string;
}): Promise<{ ok: true; globalSandboxApiEnabled: boolean }> {
  await ensureSandboxSettingsRow();
  const updated = await prisma.sandboxSettings.update({
    where: { id: SANDBOX_SETTINGS_ID },
    data: {
      globalSandboxApiEnabled: input.enabled === true,
      updatedByAdminId: input.adminUserId,
    },
    select: { globalSandboxApiEnabled: true },
  });
  return {
    ok: true,
    globalSandboxApiEnabled: updated.globalSandboxApiEnabled,
  };
}

export async function setSandboxPartnerApiEnabled(input: {
  partnerId: string;
  enabled: boolean;
}): Promise<{ ok: true; apiEnabled: boolean } | { ok: false; error: string }> {
  const partnerId = input.partnerId.trim();
  if (!partnerId) return { ok: false, error: "Missing partner." };
  try {
    const updated = await prisma.sandboxPartner.update({
      where: { id: partnerId },
      data: { apiEnabled: input.enabled === true },
      select: { apiEnabled: true },
    });
    return { ok: true, apiEnabled: updated.apiEnabled };
  } catch {
    return { ok: false, error: "Sandbox partner not found." };
  }
}

/**
 * Resolve whether sandbox API calls are allowed for an optional partner id.
 * Missing partner id → only global flag applies (auth still required separately).
 */
export async function resolveSandboxApiAccess(
  partnerId: string | null | undefined
): Promise<SandboxApiAccessState> {
  const globalSandboxApiEnabled = await getGlobalSandboxApiEnabled();
  if (!globalSandboxApiEnabled) {
    return {
      globalSandboxApiEnabled: false,
      partnerApiEnabled: null,
      allowed: false,
    };
  }
  const id = (partnerId ?? "").trim();
  if (!id) {
    return {
      globalSandboxApiEnabled: true,
      partnerApiEnabled: null,
      allowed: true,
    };
  }
  const partner = await prisma.sandboxPartner.findUnique({
    where: { id },
    select: { apiEnabled: true, disabledAt: true },
  });
  if (!partner || partner.disabledAt) {
    return {
      globalSandboxApiEnabled: true,
      partnerApiEnabled: false,
      allowed: false,
    };
  }
  const partnerApiEnabled = partner.apiEnabled === true;
  return {
    globalSandboxApiEnabled: true,
    partnerApiEnabled,
    allowed: partnerApiEnabled,
  };
}

/** Portal UI: show docs / API keys only when both flags allow. */
export async function canSandboxPartnerUseApiUi(
  partnerId: string
): Promise<{
  globalSandboxApiEnabled: boolean;
  apiEnabled: boolean;
  showApiUi: boolean;
}> {
  const globalSandboxApiEnabled = await getGlobalSandboxApiEnabled();
  const partner = await prisma.sandboxPartner.findUnique({
    where: { id: partnerId },
    select: { apiEnabled: true, disabledAt: true },
  });
  const apiEnabled =
    Boolean(partner) && !partner?.disabledAt && partner?.apiEnabled === true;
  return {
    globalSandboxApiEnabled,
    apiEnabled,
    showApiUi: globalSandboxApiEnabled && apiEnabled,
  };
}
