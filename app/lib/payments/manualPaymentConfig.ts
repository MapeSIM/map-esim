import "server-only";

import { prisma } from "@/app/lib/db";
import {
  EMPTY_MANUAL_PAYMENT_CONFIG,
  MANUAL_PAYMENT_CONFIG_ID,
  toPublicManualPaymentConfig,
  type PublicManualPaymentConfig,
} from "@/app/lib/payments/manualPaymentConfigShared";

export type { PublicManualPaymentConfig };

export async function getPublicManualPaymentConfig(): Promise<PublicManualPaymentConfig> {
  try {
    const row = await prisma.manualPaymentConfig.findUnique({
      where: { id: MANUAL_PAYMENT_CONFIG_ID },
      select: {
        enabled: true,
        accountTitle: true,
        jazzcashNumber: true,
        easypaisaNumber: true,
        bankName: true,
        bankAccountTitle: true,
        bankAccountNumber: true,
      },
    });
    if (!row) return EMPTY_MANUAL_PAYMENT_CONFIG;
    return toPublicManualPaymentConfig(row);
  } catch {
    return EMPTY_MANUAL_PAYMENT_CONFIG;
  }
}

export async function upsertManualPaymentConfig(
  config: PublicManualPaymentConfig,
  updatedByAdminId?: string | null
): Promise<PublicManualPaymentConfig> {
  const data = toPublicManualPaymentConfig(config);
  const row = await prisma.manualPaymentConfig.upsert({
    where: { id: MANUAL_PAYMENT_CONFIG_ID },
    create: {
      id: MANUAL_PAYMENT_CONFIG_ID,
      ...data,
      version: 1,
      updatedByAdminId: updatedByAdminId ?? null,
    },
    update: {
      ...data,
      version: { increment: 1 },
      updatedByAdminId: updatedByAdminId ?? null,
    },
  });
  return toPublicManualPaymentConfig(row);
}
