/**
 * Server-only admin mutation for Simpaisa wallet operator enablement.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { findActiveAdminActor } from "@/app/lib/auth/adminAccess";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import {
  SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
  SIMPAISA_WALLET_OPERATOR_PUBLIC_ERROR,
} from "@/app/lib/payments/simpaisaWalletOperatorConfigShared";
import { ensureSimpaisaWalletOperatorConfig } from "@/app/lib/payments/simpaisaWalletOperatorConfig";

export const SIMPAISA_WALLET_OPERATOR_UPDATED_AUDIT =
  "payments.simpaisa_wallet_operators_updated";
export const SIMPAISA_WALLET_OPERATOR_BLOCKED_AUDIT =
  "payments.simpaisa_wallet_operators_blocked";

export type SimpaisaWalletOperatorMutationResult =
  | {
      ok: true;
      message: string;
      jazzcashEnabled: boolean;
      easypaisaEnabled: boolean;
      version: number;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<
        Record<"jazzcashEnabled" | "easypaisaEnabled" | "version", string>
      >;
    };

function parseEnabled(
  raw: FormDataEntryValue | string | boolean | null | undefined
): boolean {
  if (typeof raw === "boolean") return raw;
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export async function updateSimpaisaWalletOperatorConfig(options: {
  adminUserId: string;
  jazzcashEnabled: boolean | string | FormDataEntryValue | null;
  easypaisaEnabled: boolean | string | FormDataEntryValue | null;
  expectedVersion?: number | null;
}): Promise<SimpaisaWalletOperatorMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: SIMPAISA_WALLET_OPERATOR_BLOCKED_AUDIT,
      targetType: "SimpaisaWalletOperatorConfig",
      targetId: SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
      metadata: { failureCode: "same_origin" },
    });
    return { ok: false, error: SIMPAISA_WALLET_OPERATOR_PUBLIC_ERROR };
  }

  const admin = await findActiveAdminActor(options.adminUserId);
  if (!admin) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: SIMPAISA_WALLET_OPERATOR_BLOCKED_AUDIT,
      targetType: "SimpaisaWalletOperatorConfig",
      targetId: SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
      metadata: { failureCode: "inactive_admin" },
    });
    return { ok: false, error: SIMPAISA_WALLET_OPERATOR_PUBLIC_ERROR };
  }

  const rate = consumeRateLimit({
    key: `simpaisa-wallet-ops:${admin.id}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_WALLET_OPERATOR_BLOCKED_AUDIT,
      targetType: "SimpaisaWalletOperatorConfig",
      targetId: SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
      metadata: { failureCode: "rate_limited" },
    });
    return {
      ok: false,
      error: "Too many updates. Please wait a moment and try again.",
    };
  }

  const jazzcashEnabled = parseEnabled(options.jazzcashEnabled);
  const easypaisaEnabled = parseEnabled(options.easypaisaEnabled);

  await ensureSimpaisaWalletOperatorConfig();

  const current = await prisma.simpaisaWalletOperatorConfig.findUnique({
    where: { id: SIMPAISA_WALLET_OPERATOR_CONFIG_ID },
  });
  if (!current) {
    return { ok: false, error: SIMPAISA_WALLET_OPERATOR_PUBLIC_ERROR };
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

  const updated = await prisma.simpaisaWalletOperatorConfig.updateMany({
    where: {
      id: SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
      version: current.version,
    },
    data: {
      jazzcashEnabled,
      easypaisaEnabled,
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
    action: SIMPAISA_WALLET_OPERATOR_UPDATED_AUDIT,
    targetType: "SimpaisaWalletOperatorConfig",
    targetId: SIMPAISA_WALLET_OPERATOR_CONFIG_ID,
    metadata: {
      jazzcashEnabled,
      easypaisaEnabled,
      previousJazzcashEnabled: current.jazzcashEnabled,
      previousEasypaisaEnabled: current.easypaisaEnabled,
      version: nextVersion,
    },
  });

  const enabledCount = [jazzcashEnabled, easypaisaEnabled].filter(Boolean).length;
  return {
    ok: true,
    message:
      enabledCount === 0
        ? "Both JazzCash and Easypaisa are disabled for checkout."
        : enabledCount === 2
          ? "JazzCash and Easypaisa are enabled for checkout."
          : jazzcashEnabled
            ? "JazzCash is enabled. Easypaisa is disabled."
            : "Easypaisa is enabled. JazzCash is disabled.",
    jazzcashEnabled,
    easypaisaEnabled,
    version: nextVersion,
  };
}
