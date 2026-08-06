import "server-only";

import {
  VESIM_ENV_ERROR_CODE,
  VESIM_ENV_PUBLIC_ERROR,
  validateVesimEnvironmentConfig,
  type VesimEnvFailureCode,
  type VesimEnvironmentMode,
} from "@/app/lib/vesim/environmentPolicy";

export {
  VESIM_APPROVED_HOSTS,
  VESIM_ENV_ERROR_CODE,
  VESIM_ENV_PUBLIC_ERROR,
  VESIM_LIVE_HOST_UNCONFIRMED_CODE,
  VESIM_STAGING_BROKER_HOSTS,
  isApprovedVesimHostForMode,
  isHostInAllowlist,
  parseVesimBaseUrl,
  parseVesimEnvironmentMode,
  validateVesimEnvironmentConfig,
} from "@/app/lib/vesim/environmentPolicy";

export type { VesimEnvFailureCode, VesimEnvironmentMode };

/**
 * Confirmed live VeSIM broker/API hosts.
 *
 * Empty until VeSIM officially confirms the production broker base URL.
 * Do NOT copy hosts from eSIM activation URL allowlists (e.g. vesim.com).
 * Do NOT add vesim.world (or any other host) without provider confirmation.
 * Update this single list when the live API host is confirmed.
 */
export const VESIM_LIVE_BROKER_HOSTS: readonly string[] = [];

/**
 * Thrown when VESIM_ENVIRONMENT / VESIM_BASE_URL is missing, invalid,
 * mismatched, or live mode is not yet confirmed.
 * Message is always the generic public error — never includes host or secrets.
 */
export class VesimEnvironmentError extends Error {
  readonly code: VesimEnvFailureCode;

  constructor(code: VesimEnvFailureCode = VESIM_ENV_ERROR_CODE) {
    super(VESIM_ENV_PUBLIC_ERROR);
    this.name = "VesimEnvironmentError";
    this.code = code;
  }
}

function logEnvGuardFailure(code: VesimEnvFailureCode): void {
  // Safe code only — never log host, credentials, tokens, or env values.
  console.error("vesim_env_guard", code);
}

/**
 * Resolve a validated VeSIM base URL for provider calls.
 * Fail closed before any authentication or network request.
 * Live mode fails closed while VESIM_LIVE_BROKER_HOSTS is empty.
 */
export function resolveValidatedVesimBaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const result = validateVesimEnvironmentConfig({
    environment: env.VESIM_ENVIRONMENT,
    baseUrl: env.VESIM_BASE_URL,
    liveBrokerHosts: VESIM_LIVE_BROKER_HOSTS,
  });

  if (!result.ok) {
    logEnvGuardFailure(result.code);
    throw new VesimEnvironmentError(result.code);
  }

  return result.baseUrl;
}

/** True when mode + base URL are present and match an approved pairing. */
export function isVesimEnvironmentConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return validateVesimEnvironmentConfig({
    environment: env.VESIM_ENVIRONMENT,
    baseUrl: env.VESIM_BASE_URL,
    liveBrokerHosts: VESIM_LIVE_BROKER_HOSTS,
  }).ok;
}
