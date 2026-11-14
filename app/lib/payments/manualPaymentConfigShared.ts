export const MANUAL_PAYMENT_CONFIG_ID = "default";

export const MANUAL_PAYMENT_SETTING_KEYS = [
  "MANUAL_PAYMENTS_ENABLED",
  "MANUAL_ACCOUNT_TITLE",
  "JAZZCASH_NUMBER",
  "EASYPAISA_NUMBER",
  "BANK_NAME",
  "BANK_ACCOUNT_TITLE",
  "BANK_ACCOUNT_NUMBER",
] as const;

export type ManualPaymentSettingKey =
  (typeof MANUAL_PAYMENT_SETTING_KEYS)[number];

export type PublicManualPaymentConfig = {
  enabled: boolean;
  accountTitle: string;
  jazzcashNumber: string;
  easypaisaNumber: string;
  bankName: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
};

export const EMPTY_MANUAL_PAYMENT_CONFIG: PublicManualPaymentConfig = {
  enabled: false,
  accountTitle: "",
  jazzcashNumber: "",
  easypaisaNumber: "",
  bankName: "",
  bankAccountTitle: "",
  bankAccountNumber: "",
};

const FIELD_MAX = 160;

export function clipManualPaymentField(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FIELD_MAX);
}

export function toPublicManualPaymentConfig(row: {
  enabled: boolean;
  accountTitle: string;
  jazzcashNumber: string;
  easypaisaNumber: string;
  bankName: string;
  bankAccountTitle: string;
  bankAccountNumber: string;
}): PublicManualPaymentConfig {
  return {
    enabled: Boolean(row.enabled),
    accountTitle: clipManualPaymentField(row.accountTitle),
    jazzcashNumber: clipManualPaymentField(row.jazzcashNumber),
    easypaisaNumber: clipManualPaymentField(row.easypaisaNumber),
    bankName: clipManualPaymentField(row.bankName),
    bankAccountTitle: clipManualPaymentField(row.bankAccountTitle),
    bankAccountNumber: clipManualPaymentField(row.bankAccountNumber),
  };
}

export function toManualPaymentSettingsMap(
  config: PublicManualPaymentConfig
): Record<ManualPaymentSettingKey, string> {
  return {
    MANUAL_PAYMENTS_ENABLED: config.enabled ? "true" : "false",
    MANUAL_ACCOUNT_TITLE: config.accountTitle,
    JAZZCASH_NUMBER: config.jazzcashNumber,
    EASYPAISA_NUMBER: config.easypaisaNumber,
    BANK_NAME: config.bankName,
    BANK_ACCOUNT_TITLE: config.bankAccountTitle,
    BANK_ACCOUNT_NUMBER: config.bankAccountNumber,
  };
}

export function applyManualPaymentSettingKey(
  current: PublicManualPaymentConfig,
  key: string,
  value: unknown
): PublicManualPaymentConfig {
  const next = { ...current };
  switch (key) {
    case "MANUAL_PAYMENTS_ENABLED":
      next.enabled =
        value === true ||
        String(value ?? "")
          .trim()
          .toLowerCase() === "true";
      break;
    case "MANUAL_ACCOUNT_TITLE":
      next.accountTitle = clipManualPaymentField(value);
      break;
    case "JAZZCASH_NUMBER":
      next.jazzcashNumber = clipManualPaymentField(value);
      break;
    case "EASYPAISA_NUMBER":
      next.easypaisaNumber = clipManualPaymentField(value);
      break;
    case "BANK_NAME":
      next.bankName = clipManualPaymentField(value);
      break;
    case "BANK_ACCOUNT_TITLE":
      next.bankAccountTitle = clipManualPaymentField(value);
      break;
    case "BANK_ACCOUNT_NUMBER":
      next.bankAccountNumber = clipManualPaymentField(value);
      break;
    default:
      break;
  }
  return next;
}

export function parseManualPaymentConfigBody(
  body: unknown,
  current: PublicManualPaymentConfig
): PublicManualPaymentConfig {
  if (!body || typeof body !== "object") return current;
  const input = body as Record<string, unknown>;

  if (typeof input.key === "string") {
    return applyManualPaymentSettingKey(current, input.key, input.value);
  }

  let next = { ...current };
  if ("enabled" in input) {
    next.enabled =
      input.enabled === true ||
      String(input.enabled ?? "").trim().toLowerCase() === "true";
  }
  if ("accountTitle" in input) {
    next.accountTitle = clipManualPaymentField(input.accountTitle);
  }
  if ("jazzcashNumber" in input || "jazzcash" in input) {
    next.jazzcashNumber = clipManualPaymentField(
      input.jazzcashNumber ?? input.jazzcash
    );
  }
  if ("easypaisaNumber" in input || "easypaisa" in input) {
    next.easypaisaNumber = clipManualPaymentField(
      input.easypaisaNumber ?? input.easypaisa
    );
  }
  if ("bankName" in input) {
    next.bankName = clipManualPaymentField(input.bankName);
  }
  if ("bankAccountTitle" in input) {
    next.bankAccountTitle = clipManualPaymentField(input.bankAccountTitle);
  }
  if ("bankAccountNumber" in input) {
    next.bankAccountNumber = clipManualPaymentField(input.bankAccountNumber);
  }

  for (const key of MANUAL_PAYMENT_SETTING_KEYS) {
    if (key in input) {
      next = applyManualPaymentSettingKey(next, key, input[key]);
    }
  }
  return next;
}
