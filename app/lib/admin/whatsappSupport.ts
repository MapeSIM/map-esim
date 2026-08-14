/**
 * Server-only admin mutation for WhatsApp support button config.
 */
import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  WHATSAPP_SUPPORT_CONFIG_ID,
  WHATSAPP_SUPPORT_PUBLIC_ERROR,
  parseWhatsAppDefaultMessage,
  parseWhatsAppPhoneDigits,
} from "@/app/lib/support/whatsappSupportShared";
import { ensureWhatsAppSupportConfig } from "@/app/lib/support/whatsappSupport";

export const WHATSAPP_SUPPORT_UPDATED_AUDIT = "support.whatsapp_config_updated";
export const WHATSAPP_SUPPORT_BLOCKED_AUDIT = "support.whatsapp_config_blocked";

export type WhatsAppSupportMutationResult =
  | {
      ok: true;
      message: string;
      enabled: boolean;
      version: number;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<
        Record<"enabled" | "phone" | "message" | "version", string>
      >;
    };

async function requireActiveAdminActor(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
    return null;
  }
  return admin;
}

function parseEnabled(
  raw: FormDataEntryValue | string | boolean | null | undefined
): boolean {
  if (typeof raw === "boolean") return raw;
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/**
 * Upsert WhatsApp support config. CAS on version when expectedVersion provided.
 */
export async function updateWhatsAppSupportConfig(options: {
  adminUserId: string;
  enabled: boolean | string | FormDataEntryValue | null;
  phone: FormDataEntryValue | string | null;
  message: FormDataEntryValue | string | null;
  expectedVersion?: number | null;
}): Promise<WhatsAppSupportMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: WHATSAPP_SUPPORT_BLOCKED_AUDIT,
      targetType: "WhatsAppSupportConfig",
      targetId: WHATSAPP_SUPPORT_CONFIG_ID,
      metadata: { failureCode: "same_origin" },
    });
    return { ok: false, error: WHATSAPP_SUPPORT_PUBLIC_ERROR };
  }

  const admin = await requireActiveAdminActor(options.adminUserId);
  if (!admin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: WHATSAPP_SUPPORT_BLOCKED_AUDIT,
      targetType: "WhatsAppSupportConfig",
      targetId: WHATSAPP_SUPPORT_CONFIG_ID,
      metadata: { failureCode: "inactive_admin" },
    });
    return { ok: false, error: WHATSAPP_SUPPORT_PUBLIC_ERROR };
  }

  const rate = consumeRateLimit({
    key: `whatsapp-support:${admin.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: WHATSAPP_SUPPORT_BLOCKED_AUDIT,
      targetType: "WhatsAppSupportConfig",
      targetId: WHATSAPP_SUPPORT_CONFIG_ID,
      metadata: { failureCode: "rate_limited" },
    });
    return {
      ok: false,
      error: "Too many updates. Please wait a moment and try again.",
    };
  }

  const enabled = parseEnabled(options.enabled);
  const messageParsed = parseWhatsAppDefaultMessage(options.message);
  if (!messageParsed.ok) {
    return {
      ok: false,
      error: messageParsed.error,
      fieldErrors: { message: messageParsed.error },
    };
  }

  const phoneRaw = String(options.phone ?? "").trim();
  let phoneDigits: string | null = null;
  if (phoneRaw) {
    const phoneParsed = parseWhatsAppPhoneDigits(phoneRaw);
    if (!phoneParsed.ok) {
      return {
        ok: false,
        error: phoneParsed.error,
        fieldErrors: { phone: phoneParsed.error },
      };
    }
    phoneDigits = phoneParsed.digits;
  }

  if (enabled && !phoneDigits) {
    const error = "A valid WhatsApp number is required when the button is enabled.";
    return {
      ok: false,
      error,
      fieldErrors: { phone: error },
    };
  }

  await ensureWhatsAppSupportConfig();

  const current = await prisma.whatsAppSupportConfig.findUnique({
    where: { id: WHATSAPP_SUPPORT_CONFIG_ID },
  });
  if (!current) {
    return { ok: false, error: WHATSAPP_SUPPORT_PUBLIC_ERROR };
  }

  if (
    typeof options.expectedVersion === "number" &&
    Number.isFinite(options.expectedVersion) &&
    options.expectedVersion !== current.version
  ) {
    return {
      ok: false,
      error: "Settings were updated elsewhere. Refresh and try again.",
      fieldErrors: { version: "stale_version" },
    };
  }

  const updated = await prisma.whatsAppSupportConfig.updateMany({
    where: {
      id: WHATSAPP_SUPPORT_CONFIG_ID,
      version: current.version,
    },
    data: {
      enabled,
      phoneE164: phoneDigits,
      defaultMessage: messageParsed.message || null,
      version: { increment: 1 },
      updatedByAdminId: admin.id,
    },
  });

  if (updated.count !== 1) {
    return {
      ok: false,
      error: "Settings were updated elsewhere. Refresh and try again.",
      fieldErrors: { version: "stale_version" },
    };
  }

  const nextVersion = current.version + 1;
  await writeAuditLog({
    actorUserId: admin.id,
    action: WHATSAPP_SUPPORT_UPDATED_AUDIT,
    targetType: "WhatsAppSupportConfig",
    targetId: WHATSAPP_SUPPORT_CONFIG_ID,
    metadata: {
      enabled,
      phoneE164: phoneDigits,
      messageLength: messageParsed.message.length,
      previousEnabled: current.enabled,
      version: nextVersion,
    },
  });

  return {
    ok: true,
    message: enabled
      ? "WhatsApp support button is enabled on the public site."
      : "WhatsApp support button is disabled on the public site.",
    enabled,
    version: nextVersion,
  };
}
