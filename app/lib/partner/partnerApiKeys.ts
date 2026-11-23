/**
 * Partner API key mint / list / revoke (session-authenticated).
 * Raw token shown once; only SHA-256 hash is stored.
 */
import "server-only";

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { hashPartnerApiToken } from "@/app/lib/partnerApiAuth";

export const PARTNER_API_KEY_CREATED_AUDIT = "partner.api_key_created";
export const PARTNER_API_KEY_REVOKED_AUDIT = "partner.api_key_revoked";

const KEY_NAME_MAX = 64;

export type PartnerApiKeyListRow = {
  id: string;
  name: string;
  prefix: string;
  createdAtLabel: string;
  lastUsedAtLabel: string;
  revoked: boolean;
};

function formatUtc(date: Date | null | undefined): string {
  if (!date) return "Never";
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function mintRawToken(): { raw: string; prefix: string; keyHash: string } {
  const secret = randomBytes(24).toString("base64url");
  const raw = `map_live_${secret}`;
  const prefix = `${raw.slice(0, 16)}…`;
  const keyHash = hashPartnerApiToken(raw);
  return { raw, prefix, keyHash };
}

export async function listPartnerApiKeysForUser(
  partnerUserId: string
): Promise<PartnerApiKeyListRow[] | null> {
  const actor = await requireActivePartnerActor(partnerUserId);
  if (!actor) return null;

  const rows = await prisma.partnerApiKey.findMany({
    where: { partnerId: actor.partnerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAtLabel: formatUtc(row.createdAt),
    lastUsedAtLabel: formatUtc(row.lastUsedAt),
    revoked: Boolean(row.revokedAt),
  }));
}

export async function createPartnerApiKey(options: {
  partnerUserId: string;
  name: unknown;
}): Promise<
  | { ok: true; keyId: string; name: string; prefix: string; rawToken: string }
  | { ok: false; error: string }
> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return { ok: false, error: "Partner access is unavailable." };
  }

  const access = await prisma.partnerProfile.findUnique({
    where: { id: actor.partnerId },
    select: { apiEnabled: true },
  });
  if (!access?.apiEnabled) {
    return {
      ok: false,
      error:
        "API access is currently disabled for your account — contact support to request access.",
    };
  }

  const name = String(options.name ?? "")
    .replace(/[\r\n\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, KEY_NAME_MAX);
  if (!name) {
    return { ok: false, error: "Enter a name for this API key." };
  }

  const activeCount = await prisma.partnerApiKey.count({
    where: { partnerId: actor.partnerId, revokedAt: null },
  });
  if (activeCount >= 10) {
    return {
      ok: false,
      error: "You can have at most 10 active API keys. Revoke one first.",
    };
  }

  const minted = mintRawToken();
  try {
    const row = await prisma.partnerApiKey.create({
      data: {
        partnerId: actor.partnerId,
        name,
        prefix: minted.prefix,
        keyHash: minted.keyHash,
      },
      select: { id: true, name: true, prefix: true },
    });
    await writeAuditLog({
      actorUserId: actor.userId,
      action: PARTNER_API_KEY_CREATED_AUDIT,
      targetType: "PartnerApiKey",
      targetId: row.id,
      metadata: { partnerId: actor.partnerId, prefix: row.prefix, name: row.name },
    });
    try {
      const { schedulePartnerApiKeyEmail } = await import(
        "@/app/lib/partner/partnerEmailNotifications"
      );
      schedulePartnerApiKeyEmail({
        partnerId: actor.partnerId,
        event: "created",
        keyName: row.name,
        keyPrefix: row.prefix,
      });
    } catch {
      /* non-blocking */
    }
    return {
      ok: true,
      keyId: row.id,
      name: row.name,
      prefix: row.prefix,
      rawToken: minted.raw,
    };
  } catch (error) {
    // Extremely unlikely hash collision — retry once.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const again = mintRawToken();
      const row = await prisma.partnerApiKey.create({
        data: {
          partnerId: actor.partnerId,
          name,
          prefix: again.prefix,
          keyHash: again.keyHash,
        },
        select: { id: true, name: true, prefix: true },
      });
      try {
        const { schedulePartnerApiKeyEmail } = await import(
          "@/app/lib/partner/partnerEmailNotifications"
        );
        schedulePartnerApiKeyEmail({
          partnerId: actor.partnerId,
          event: "created",
          keyName: row.name,
          keyPrefix: row.prefix,
        });
      } catch {
        /* non-blocking */
      }
      return {
        ok: true,
        keyId: row.id,
        name: row.name,
        prefix: row.prefix,
        rawToken: again.raw,
      };
    }
    return { ok: false, error: "Could not create API key. Try again shortly." };
  }
}

export async function revokePartnerApiKey(options: {
  partnerUserId: string;
  keyId: unknown;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return { ok: false, error: "Partner access is unavailable." };
  }
  const keyId = String(options.keyId ?? "").trim();
  if (!keyId || keyId.length > 64) {
    return { ok: false, error: "API key not found." };
  }

  const existing = await prisma.partnerApiKey.findFirst({
    where: {
      id: keyId,
      partnerId: actor.partnerId,
      revokedAt: null,
    },
    select: { id: true, name: true, prefix: true },
  });
  if (!existing) {
    return { ok: false, error: "API key not found or already revoked." };
  }

  const updated = await prisma.partnerApiKey.updateMany({
    where: {
      id: existing.id,
      partnerId: actor.partnerId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (updated.count !== 1) {
    return { ok: false, error: "API key not found or already revoked." };
  }
  await writeAuditLog({
    actorUserId: actor.userId,
    action: PARTNER_API_KEY_REVOKED_AUDIT,
    targetType: "PartnerApiKey",
    targetId: keyId,
    metadata: { partnerId: actor.partnerId },
  });
  try {
    const { schedulePartnerApiKeyEmail } = await import(
      "@/app/lib/partner/partnerEmailNotifications"
    );
    schedulePartnerApiKeyEmail({
      partnerId: actor.partnerId,
      event: "revoked",
      keyName: existing.name,
      keyPrefix: existing.prefix,
    });
  } catch {
    /* non-blocking */
  }
  return { ok: true };
}

/** Admin read — never returns hashes or raw tokens. */
export async function listPartnerApiKeysForAdmin(
  partnerId: string
): Promise<PartnerApiKeyListRow[]> {
  const id = partnerId.trim();
  if (!id) return [];
  const rows = await prisma.partnerApiKey.findMany({
    where: { partnerId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAtLabel: formatUtc(row.createdAt),
    lastUsedAtLabel: formatUtc(row.lastUsedAt),
    revoked: Boolean(row.revokedAt),
  }));
}

export async function adminRevokePartnerApiKey(options: {
  adminUserId: string;
  partnerId: string;
  keyId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const partnerId = options.partnerId.trim();
  const keyId = options.keyId.trim();
  if (!partnerId || !keyId) {
    return { ok: false, error: "API key not found." };
  }
  const updated = await prisma.partnerApiKey.updateMany({
    where: { id: keyId, partnerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count !== 1) {
    return { ok: false, error: "API key not found or already revoked." };
  }
  await writeAuditLog({
    actorUserId: options.adminUserId,
    action: PARTNER_API_KEY_REVOKED_AUDIT,
    targetType: "PartnerApiKey",
    targetId: keyId,
    metadata: { partnerId, byAdmin: true },
  });
  return { ok: true };
}

/** Exported for docs / tests — do not use for storage. */
export function partnerApiKeySha256(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
