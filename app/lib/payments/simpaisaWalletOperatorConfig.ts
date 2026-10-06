/**
 * Server-only Simpaisa wallet operator enablement reads.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import {
  SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
  SIMPAISA_WALLET_OPERATOR_SOFT_DEFAULT,
  toPublicSimpaisaWalletOperatorConfig,
  type AdminSimpaisaWalletOperatorView,
  type SimpaisaWalletOperatorPublicConfig,
} from "@/app/lib/payments/simpaisaWalletOperatorConfigShared";

export type { AdminSimpaisaWalletOperatorView, SimpaisaWalletOperatorPublicConfig };

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

/** Ensure singleton row exists (JazzCash on / Easypaisa off by default). */
export async function ensureSimpaisaWalletOperatorConfig(): Promise<void> {
  await prisma.simpaisaWalletOperatorConfig.upsert({
    where: { id: SIMPAISA_WALLET_OPERATOR_CONFIG_ID },
    create: {
      id: SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
      jazzcashEnabled: SIMPAISA_WALLET_OPERATOR_SOFT_DEFAULT.jazzcashEnabled,
      easypaisaEnabled: SIMPAISA_WALLET_OPERATOR_SOFT_DEFAULT.easypaisaEnabled,
      version: 1,
    },
    update: {},
  });
}

/**
 * Public/checkout enablement. Soft-fails to JazzCash-only when DB unavailable.
 */
export async function getSimpaisaWalletOperatorConfig(): Promise<SimpaisaWalletOperatorPublicConfig> {
  try {
    const row = await prisma.simpaisaWalletOperatorConfig.findUnique({
      where: { id: SIMPAISA_WALLET_OPERATOR_CONFIG_ID },
      select: {
        jazzcashEnabled: true,
        easypaisaEnabled: true,
      },
    });
    if (!row) {
      return toPublicSimpaisaWalletOperatorConfig(
        SIMPAISA_WALLET_OPERATOR_SOFT_DEFAULT
      );
    }
    return toPublicSimpaisaWalletOperatorConfig(row);
  } catch {
    return toPublicSimpaisaWalletOperatorConfig(
      SIMPAISA_WALLET_OPERATOR_SOFT_DEFAULT
    );
  }
}

export async function getAdminSimpaisaWalletOperatorView(): Promise<AdminSimpaisaWalletOperatorView> {
  await ensureSimpaisaWalletOperatorConfig();
  const row = await prisma.simpaisaWalletOperatorConfig.findUniqueOrThrow({
    where: { id: SIMPAISA_WALLET_OPERATOR_CONFIG_ID },
  });
  return {
    jazzcashEnabled: row.jazzcashEnabled,
    easypaisaEnabled: row.easypaisaEnabled,
    version: row.version,
    updatedAtLabel: formatUpdatedAt(row.updatedAt),
    updatedByAdminIdSafe: row.updatedByAdminId
      ? `${row.updatedByAdminId.slice(0, 8)}…`
      : null,
  };
}
