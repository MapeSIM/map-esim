import "server-only";

import {
  Prisma,
  ReferralRewardType,
  type CustomerReferralProgramConfig,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  REFERRAL_PROGRAM_CONFIG_ID,
  REFERRAL_PROGRAM_DEFAULTS,
  formatReferralRewardCopy,
  type ReferralProgramSettings,
} from "@/app/lib/referrals/referralProgramShared";

export type ReferralProgramConfigRow = Pick<
  CustomerReferralProgramConfig,
  | "id"
  | "enabled"
  | "rewardType"
  | "rewardValue"
  | "minPurchaseCents"
  | "maxRewardCents"
  | "version"
  | "updatedAt"
  | "updatedByAdminId"
>;

export function toReferralProgramSettings(
  row: Pick<
    CustomerReferralProgramConfig,
    | "enabled"
    | "rewardType"
    | "rewardValue"
    | "minPurchaseCents"
    | "maxRewardCents"
  >
): ReferralProgramSettings {
  return {
    enabled: row.enabled,
    rewardType:
      row.rewardType === ReferralRewardType.PERCENTAGE
        ? "PERCENTAGE"
        : "FIXED_AMOUNT",
    rewardValue: row.rewardValue,
    minPurchaseCents: row.minPurchaseCents,
    maxRewardCents: row.maxRewardCents,
  };
}

export async function ensureReferralProgramConfig(): Promise<void> {
  await prisma.customerReferralProgramConfig.createMany({
    data: [
      {
        id: REFERRAL_PROGRAM_CONFIG_ID,
        enabled: REFERRAL_PROGRAM_DEFAULTS.enabled,
        rewardType: ReferralRewardType.FIXED_AMOUNT,
        rewardValue: REFERRAL_PROGRAM_DEFAULTS.rewardValue,
        minPurchaseCents: REFERRAL_PROGRAM_DEFAULTS.minPurchaseCents,
        maxRewardCents: REFERRAL_PROGRAM_DEFAULTS.maxRewardCents,
        version: 1,
      },
    ],
    skipDuplicates: true,
  });
}

export async function getReferralProgramConfig(
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<ReferralProgramConfigRow> {
  await db.customerReferralProgramConfig.createMany({
    data: [
      {
        id: REFERRAL_PROGRAM_CONFIG_ID,
        enabled: REFERRAL_PROGRAM_DEFAULTS.enabled,
        rewardType: ReferralRewardType.FIXED_AMOUNT,
        rewardValue: REFERRAL_PROGRAM_DEFAULTS.rewardValue,
        minPurchaseCents: REFERRAL_PROGRAM_DEFAULTS.minPurchaseCents,
        maxRewardCents: REFERRAL_PROGRAM_DEFAULTS.maxRewardCents,
        version: 1,
      },
    ],
    skipDuplicates: true,
  });
  const row = await db.customerReferralProgramConfig.findUnique({
    where: { id: REFERRAL_PROGRAM_CONFIG_ID },
  });
  if (!row) {
    return db.customerReferralProgramConfig.create({
      data: {
        id: REFERRAL_PROGRAM_CONFIG_ID,
        enabled: REFERRAL_PROGRAM_DEFAULTS.enabled,
        rewardType: ReferralRewardType.FIXED_AMOUNT,
        rewardValue: REFERRAL_PROGRAM_DEFAULTS.rewardValue,
        minPurchaseCents: REFERRAL_PROGRAM_DEFAULTS.minPurchaseCents,
        maxRewardCents: REFERRAL_PROGRAM_DEFAULTS.maxRewardCents,
        version: 1,
      },
    });
  }
  return row;
}

export async function getReferralProgramSettings(
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<ReferralProgramSettings> {
  const row = await getReferralProgramConfig(db);
  return toReferralProgramSettings(row);
}

export type AdminReferralProgramView = {
  enabled: boolean;
  rewardType: ReferralProgramSettings["rewardType"];
  /** FIXED: USD amount string; PERCENTAGE: percent string (e.g. "5" or "5.00"). */
  rewardValueDisplay: string;
  minPurchaseDisplay: string;
  maxRewardDisplay: string;
  version: number;
  updatedAtLabel: string;
  rewardCopy: string;
};

export function toAdminReferralProgramView(
  row: ReferralProgramConfigRow
): AdminReferralProgramView {
  const settings = toReferralProgramSettings(row);
  const rewardValueDisplay =
    settings.rewardType === "FIXED_AMOUNT"
      ? (settings.rewardValue / 100).toFixed(2)
      : (settings.rewardValue / 100).toFixed(
          settings.rewardValue % 100 === 0 ? 0 : 2
        );

  return {
    enabled: settings.enabled,
    rewardType: settings.rewardType,
    rewardValueDisplay,
    minPurchaseDisplay: (settings.minPurchaseCents / 100).toFixed(2),
    maxRewardDisplay:
      settings.maxRewardCents == null
        ? ""
        : (settings.maxRewardCents / 100).toFixed(2),
    version: row.version,
    updatedAtLabel:
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(row.updatedAt) + " UTC",
    rewardCopy: formatReferralRewardCopy(settings),
  };
}

export async function getAdminReferralProgramView(): Promise<AdminReferralProgramView> {
  const row = await getReferralProgramConfig();
  return toAdminReferralProgramView(row);
}

/** Display helper for admin preview labels. */
export function formatFixedRewardPreview(cents: number): string {
  return formatUsdCents(cents);
}
