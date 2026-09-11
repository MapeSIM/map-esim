/**
 * Server-only admin mutation for customer referral program settings.
 */
import "server-only";

import { ReferralRewardType } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { findActiveAdminActor } from "@/app/lib/auth/adminAccess";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  ensureReferralProgramConfig,
  getReferralProgramConfig,
  toAdminReferralProgramView,
  type AdminReferralProgramView,
} from "@/app/lib/referrals/referralProgramConfig";
import {
  REFERRAL_FIXED_REWARD_MAX_CENTS,
  REFERRAL_FIXED_REWARD_MIN_CENTS,
  REFERRAL_MAX_REWARD_CAP_MAX_CENTS,
  REFERRAL_MIN_PURCHASE_MAX_CENTS,
  REFERRAL_PERCENT_BPS_MAX,
  REFERRAL_PERCENT_BPS_MIN,
  REFERRAL_PROGRAM_CONFIG_ID,
  parseEnabledFlag,
  parseReferralRewardType,
} from "@/app/lib/referrals/referralProgramShared";
import { parsePositiveUsdCentsRaw } from "@/app/lib/wallet/amount";

export const REFERRAL_PROGRAM_UPDATED_AUDIT = "referral.program_config_updated";
export const REFERRAL_PROGRAM_BLOCKED_AUDIT = "referral.program_config_blocked";

export type ReferralProgramMutationResult =
  | {
      ok: true;
      message: string;
      view: AdminReferralProgramView;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<
        Record<
          | "enabled"
          | "rewardType"
          | "rewardValue"
          | "minPurchase"
          | "maxReward"
          | "version",
          string
        >
      >;
    };

function parsePercentToBps(raw: unknown):
  | { ok: true; bps: number }
  | { ok: false; error: string } {
  if (typeof raw !== "string" && typeof raw !== "number") {
    return { ok: false, error: "Enter a valid percentage." };
  }
  const s = String(raw).trim();
  if (!s) return { ok: false, error: "Enter a valid percentage." };
  if (/[eE+]/.test(s) || s.includes("-") || s.includes(",")) {
    return { ok: false, error: "Enter a valid percentage." };
  }
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s)) {
    return {
      ok: false,
      error: "Use up to two decimal places (for example 5 or 5.50).",
    };
  }
  const [wholePart, fracPart = ""] = s.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(2, "0"), 10);
  if (!Number.isInteger(whole) || whole < 0 || frac < 0 || frac > 99) {
    return { ok: false, error: "Enter a valid percentage." };
  }
  const bps = whole * 100 + frac;
  if (bps < REFERRAL_PERCENT_BPS_MIN || bps > REFERRAL_PERCENT_BPS_MAX) {
    return {
      ok: false,
      error: "Percentage must be between 0.01% and 100%.",
    };
  }
  return { ok: true, bps };
}

/**
 * Update singleton referral program settings. CAS on version when provided.
 */
export async function updateReferralProgramConfig(options: {
  adminUserId: string;
  enabled: unknown;
  rewardType: unknown;
  rewardValue: unknown;
  minPurchase: unknown;
  maxReward: unknown;
  expectedVersion?: number | null;
}): Promise<ReferralProgramMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: REFERRAL_PROGRAM_BLOCKED_AUDIT,
      targetType: "CustomerReferralProgramConfig",
      targetId: REFERRAL_PROGRAM_CONFIG_ID,
      metadata: { failureCode: "same_origin" },
    });
    return { ok: false, error: "Unable to update referral settings." };
  }

  const admin = await findActiveAdminActor(options.adminUserId);
  if (!admin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: REFERRAL_PROGRAM_BLOCKED_AUDIT,
      targetType: "CustomerReferralProgramConfig",
      targetId: REFERRAL_PROGRAM_CONFIG_ID,
      metadata: { failureCode: "inactive_admin" },
    });
    return { ok: false, error: "Unable to update referral settings." };
  }

  const rate = consumeRateLimit({
    key: `referral-program:${admin.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.ok) {
    return {
      ok: false,
      error: "Too many updates. Please wait a moment and try again.",
    };
  }

  const enabled = parseEnabledFlag(options.enabled);
  const rewardType = parseReferralRewardType(options.rewardType);
  if (!rewardType) {
    return {
      ok: false,
      error: "Choose a reward type.",
      fieldErrors: { rewardType: "Choose Fixed amount or Percentage." },
    };
  }

  let rewardValue = 0;
  if (rewardType === "FIXED_AMOUNT") {
    const parsed = parsePositiveUsdCentsRaw(options.rewardValue);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        fieldErrors: { rewardValue: parsed.error },
      };
    }
    if (
      parsed.cents < REFERRAL_FIXED_REWARD_MIN_CENTS ||
      parsed.cents > REFERRAL_FIXED_REWARD_MAX_CENTS
    ) {
      return {
        ok: false,
        error: "Fixed reward must be between $0.01 and $500.00.",
        fieldErrors: {
          rewardValue: "Fixed reward must be between $0.01 and $500.00.",
        },
      };
    }
    rewardValue = parsed.cents;
  } else {
    const parsed = parsePercentToBps(options.rewardValue);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        fieldErrors: { rewardValue: parsed.error },
      };
    }
    rewardValue = parsed.bps;
  }

  const minRaw = String(options.minPurchase ?? "").trim();
  let minPurchaseCents = 0;
  if (minRaw) {
    const parsed = parsePositiveUsdCentsRaw(minRaw);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        fieldErrors: { minPurchase: parsed.error },
      };
    }
    if (parsed.cents > REFERRAL_MIN_PURCHASE_MAX_CENTS) {
      return {
        ok: false,
        error: "Minimum purchase cannot exceed $500.00.",
        fieldErrors: { minPurchase: "Minimum purchase cannot exceed $500.00." },
      };
    }
    minPurchaseCents = parsed.cents;
  }

  const maxRaw = String(options.maxReward ?? "").trim();
  let maxRewardCents: number | null = null;
  if (rewardType === "PERCENTAGE" && maxRaw) {
    const parsed = parsePositiveUsdCentsRaw(maxRaw);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        fieldErrors: { maxReward: parsed.error },
      };
    }
    if (
      parsed.cents < REFERRAL_FIXED_REWARD_MIN_CENTS ||
      parsed.cents > REFERRAL_MAX_REWARD_CAP_MAX_CENTS
    ) {
      return {
        ok: false,
        error: "Max reward cap must be between $0.01 and $500.00.",
        fieldErrors: {
          maxReward: "Max reward cap must be between $0.01 and $500.00.",
        },
      };
    }
    maxRewardCents = parsed.cents;
  }

  await ensureReferralProgramConfig();
  const current = await getReferralProgramConfig();
  const expectedVersion =
    typeof options.expectedVersion === "number" &&
    Number.isInteger(options.expectedVersion)
      ? options.expectedVersion
      : null;

  if (expectedVersion != null && current.version !== expectedVersion) {
    return {
      ok: false,
      error: "Settings changed in another session. Reload and try again.",
      fieldErrors: { version: "Version conflict." },
    };
  }

  const updated = await prisma.customerReferralProgramConfig.updateMany({
    where: {
      id: REFERRAL_PROGRAM_CONFIG_ID,
      ...(expectedVersion != null ? { version: expectedVersion } : {}),
    },
    data: {
      enabled,
      rewardType:
        rewardType === "PERCENTAGE"
          ? ReferralRewardType.PERCENTAGE
          : ReferralRewardType.FIXED_AMOUNT,
      rewardValue,
      minPurchaseCents,
      maxRewardCents,
      version: { increment: 1 },
      updatedByAdminId: admin.id,
    },
  });

  if (updated.count !== 1) {
    return {
      ok: false,
      error: "Settings changed in another session. Reload and try again.",
      fieldErrors: { version: "Version conflict." },
    };
  }

  const row = await getReferralProgramConfig();
  await writeAuditLog({
    actorUserId: admin.id,
    action: REFERRAL_PROGRAM_UPDATED_AUDIT,
    targetType: "CustomerReferralProgramConfig",
    targetId: REFERRAL_PROGRAM_CONFIG_ID,
    metadata: {
      enabled,
      rewardType,
      rewardValue,
      minPurchaseCents,
      maxRewardCents,
      version: row.version,
    },
  });

  return {
    ok: true,
    message: "Referral program settings saved.",
    view: toAdminReferralProgramView(row),
  };
}
