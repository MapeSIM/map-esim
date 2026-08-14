/**
 * Server-only WhatsApp support config reads (public + admin).
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import {
  WHATSAPP_SUPPORT_CONFIG_ID,
  toPublicWhatsAppSupportConfig,
  type AdminWhatsAppSupportView,
  type PublicWhatsAppSupportConfig,
} from "@/app/lib/support/whatsappSupportShared";

export type { AdminWhatsAppSupportView };

function formatUpdatedAt(value: Date | null | undefined): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

/** Ensure singleton row exists (disabled by default). */
export async function ensureWhatsAppSupportConfig(): Promise<void> {
  await prisma.whatsAppSupportConfig.upsert({
    where: { id: WHATSAPP_SUPPORT_CONFIG_ID },
    create: {
      id: WHATSAPP_SUPPORT_CONFIG_ID,
      enabled: false,
      phoneE164: null,
      defaultMessage: null,
      version: 1,
    },
    update: {},
  });
}

export async function getPublicWhatsAppSupportConfig(): Promise<PublicWhatsAppSupportConfig> {
  try {
    const row = await prisma.whatsAppSupportConfig.findUnique({
      where: { id: WHATSAPP_SUPPORT_CONFIG_ID },
      select: {
        enabled: true,
        phoneE164: true,
        defaultMessage: true,
      },
    });
    if (!row) return { enabled: false };
    return toPublicWhatsAppSupportConfig(row);
  } catch {
    return { enabled: false };
  }
}

export async function getAdminWhatsAppSupportView(): Promise<AdminWhatsAppSupportView> {
  await ensureWhatsAppSupportConfig();
  const row = await prisma.whatsAppSupportConfig.findUniqueOrThrow({
    where: { id: WHATSAPP_SUPPORT_CONFIG_ID },
  });
  const digits = (row.phoneE164 ?? "").trim();
  return {
    enabled: row.enabled,
    phoneDisplay: digits ? `+${digits}` : "",
    message: row.defaultMessage ?? "",
    version: row.version,
    updatedAtLabel: formatUpdatedAt(row.updatedAt),
    updatedByAdminIdSafe: row.updatedByAdminId
      ? `${row.updatedByAdminId.slice(0, 8)}…`
      : null,
  };
}
