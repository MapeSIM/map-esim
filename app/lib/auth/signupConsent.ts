import {
  LEGAL_CONSENT_ERROR,
  LEGAL_CONSENT_SOURCE_SIGNUP,
  LEGAL_POLICY_VERSION,
} from "@/app/lib/legal";

export { LEGAL_CONSENT_ERROR };

export function isSignupConsentAccepted(value: unknown): boolean {
  return value === true || value === "on" || value === "true" || value === "1";
}

/** Prisma data written only after signup consent is validated. */
export function signupConsentRecord(now = new Date()) {
  return {
    termsAcceptedAt: now,
    termsVersion: LEGAL_POLICY_VERSION,
    privacyAcknowledgedAt: now,
    privacyVersion: LEGAL_POLICY_VERSION,
    legalConsentSource: LEGAL_CONSENT_SOURCE_SIGNUP,
  };
}
