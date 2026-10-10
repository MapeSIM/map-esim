/**
 * Server-only WhatsApp support config reads (public + admin).
 * Floating support (`enabled`) and checkout fallback (`checkoutFallbackEnabled`)
 * are independent; both share `phoneE164`.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import {
  WHATSAPP_SUPPORT_CONFIG_ID,
  resolveWhatsAppCheckoutPhoneDigits,
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

/** Ensure singleton row exists (support off; checkout fallback on by default). */
export async function ensureWhatsAppSupportConfig(): Promise<void> {
  await prisma.whatsAppSupportConfig.upsert({
    where: { id: WHATSAPP_SUPPORT_CONFIG_ID },
    create: {
      id: WHATSAPP_SUPPORT_CONFIG_ID,
      enabled: false,
      checkoutFallbackEnabled: true,
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

/**
 * Digits-only WhatsApp number for checkout fallback, or null when
 * `checkoutFallbackEnabled` is off / phone unconfigured.
 * Independent of the floating support button `enabled` flag.
 */
export async function getWhatsAppCheckoutPhoneDigits(): Promise<string | null> {
  try {
    const row = await prisma.whatsAppSupportConfig.findUnique({
      where: { id: WHATSAPP_SUPPORT_CONFIG_ID },
      select: {
        checkoutFallbackEnabled: true,
        phoneE164: true,
      },
    });
    if (!row) return null;
    return resolveWhatsAppCheckoutPhoneDigits(row);
  } catch {
    return null;
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
    checkoutFallbackEnabled: row.checkoutFallbackEnabled,
    phoneDisplay: digits ? `+${digits}` : "",
    message: row.defaultMessage ?? "",
    version: row.version,
    updatedAtLabel: formatUpdatedAt(row.updatedAt),
    updatedByAdminIdSafe: row.updatedByAdminId
      ? `${row.updatedByAdminId.slice(0, 8)}…`
      : null,
  };
}
