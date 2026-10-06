/**
 * Pure Simpaisa wallet-operator enablement helpers (offline-QA safe).
 * No Prisma / network / secrets.
 */
import {
  SIMPAISA_WALLET_OPERATORS,
  type SimpaisaWalletOperatorId,
} from "@/app/lib/payments/simpaisaPolicy";

export const SIMPAISA_WALLET_OPERATOR_CONFIG_ID = "default" as const;

export const SIMPAISA_WALLET_OPERATOR_PUBLIC_ERROR =
  "Unable to update wallet operator settings right now.";

/** Soft fallback when the singleton row is missing or DB is unavailable. */
export const SIMPAISA_WALLET_OPERATOR_SOFT_DEFAULT = {
  jazzcashEnabled: true,
  easypaisaEnabled: false,
} as const;

export type SimpaisaWalletOperatorEnablement = {
  jazzcashEnabled: boolean;
  easypaisaEnabled: boolean;
};

export type SimpaisaWalletOperatorPublicConfig = SimpaisaWalletOperatorEnablement & {
  enabledOperatorIds: SimpaisaWalletOperatorId[];
};

export type AdminSimpaisaWalletOperatorView = SimpaisaWalletOperatorEnablement & {
  version: number;
  updatedAtLabel: string | null;
  updatedByAdminIdSafe: string | null;
};

export function enabledSimpaisaWalletOperatorIds(
  config: SimpaisaWalletOperatorEnablement
): SimpaisaWalletOperatorId[] {
  const ids: SimpaisaWalletOperatorId[] = [];
  if (config.easypaisaEnabled) {
    ids.push(SIMPAISA_WALLET_OPERATORS.EASYPAISA);
  }
  if (config.jazzcashEnabled) {
    ids.push(SIMPAISA_WALLET_OPERATORS.JAZZCASH);
  }
  return ids;
}

export function toPublicSimpaisaWalletOperatorConfig(
  config: SimpaisaWalletOperatorEnablement
): SimpaisaWalletOperatorPublicConfig {
  return {
    jazzcashEnabled: config.jazzcashEnabled === true,
    easypaisaEnabled: config.easypaisaEnabled === true,
    enabledOperatorIds: enabledSimpaisaWalletOperatorIds({
      jazzcashEnabled: config.jazzcashEnabled === true,
      easypaisaEnabled: config.easypaisaEnabled === true,
    }),
  };
}

export function isSimpaisaWalletOperatorEnabled(
  operatorId: string | null | undefined,
  config: SimpaisaWalletOperatorEnablement
): boolean {
  const id = (operatorId ?? "").trim();
  if (id === SIMPAISA_WALLET_OPERATORS.EASYPAISA) {
    return config.easypaisaEnabled === true;
  }
  if (id === SIMPAISA_WALLET_OPERATORS.JAZZCASH) {
    return config.jazzcashEnabled === true;
  }
  return false;
}

export function simpaisaWalletOperatorDisabledMessage(
  operatorId: string | null | undefined
): string {
  const id = (operatorId ?? "").trim();
  if (id === SIMPAISA_WALLET_OPERATORS.EASYPAISA) {
    return "Easypaisa is currently under maintenance. Please use JazzCash.";
  }
  if (id === SIMPAISA_WALLET_OPERATORS.JAZZCASH) {
    return "JazzCash is currently under maintenance. Please use Easypaisa.";
  }
  return "That mobile wallet is not available right now.";
}

export function simpaisaWalletOperatorsUnavailableMessage(): string {
  return "Mobile wallet payment is temporarily unavailable. Please try again later or use Partner/wallet balance when available.";
}

export function simpaisaWalletOperatorSelectPrompt(
  config: SimpaisaWalletOperatorEnablement
): string {
  const ids = enabledSimpaisaWalletOperatorIds(config);
  if (ids.length === 0) return simpaisaWalletOperatorsUnavailableMessage();
  if (ids.length === 1) {
    return ids[0] === SIMPAISA_WALLET_OPERATORS.EASYPAISA
      ? "Select Easypaisa."
      : "Select JazzCash.";
  }
  return "Select Easypaisa or JazzCash.";
}
