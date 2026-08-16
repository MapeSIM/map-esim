/**
 * Safe Partner logo upload stage codes.
 * Never include secrets, raw exception text, tokens, or image bytes.
 */
export const PARTNER_LOGO_STAGE = {
  AUTH_FAILED: "PARTNER_LOGO_AUTH_FAILED",
  INVALID_IMAGE: "PARTNER_LOGO_INVALID_IMAGE",
  IMAGE_PROCESS_FAILED: "PARTNER_LOGO_IMAGE_PROCESS_FAILED",
  BLOB_CONFIG_MISSING: "PARTNER_LOGO_BLOB_CONFIG_MISSING",
  BLOB_PUT_FAILED: "PARTNER_LOGO_BLOB_PUT_FAILED",
  BLOB_URL_REJECTED: "PARTNER_LOGO_BLOB_URL_REJECTED",
  PROFILE_UPDATE_FAILED: "PARTNER_LOGO_PROFILE_UPDATE_FAILED",
  CLEANUP_FAILED: "PARTNER_LOGO_CLEANUP_FAILED",
} as const;

export type PartnerLogoStage =
  (typeof PARTNER_LOGO_STAGE)[keyof typeof PARTNER_LOGO_STAGE];

export const PARTNER_LOGO_STAGES = Object.values(PARTNER_LOGO_STAGE);

export function isPartnerLogoStage(value: unknown): value is PartnerLogoStage {
  return (
    typeof value === "string" &&
    (PARTNER_LOGO_STAGES as string[]).includes(value)
  );
}

export type SafePartnerLogoStageMeta = {
  stage: PartnerLogoStage;
  partnerId?: string | null;
  contentType?: string | null;
  inputBytes?: number | null;
  processedBytes?: number | null;
  pathnamePrefix?: string | null;
};

export function safePartnerLogoStageMeta(
  input: SafePartnerLogoStageMeta
): Record<string, string | number | null> {
  return {
    stage: input.stage,
    partnerId: input.partnerId ?? null,
    contentType: input.contentType ?? null,
    inputBytes:
      typeof input.inputBytes === "number" && Number.isFinite(input.inputBytes)
        ? input.inputBytes
        : null,
    processedBytes:
      typeof input.processedBytes === "number" &&
      Number.isFinite(input.processedBytes)
        ? input.processedBytes
        : null,
    pathnamePrefix: input.pathnamePrefix ?? null,
  };
}
