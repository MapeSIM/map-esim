/**
 * Centralized legal-page configuration.
 * Update LEGAL_LAST_UPDATED (and keep LEGAL_POLICY_VERSION aligned) when
 * policies change after business/legal review.
 */

export const LEGAL_LAST_UPDATED = "3 August 2026";

/** Stable consent version stored on User records — same revision as legal pages. */
export const LEGAL_POLICY_VERSION = LEGAL_LAST_UPDATED;

/**
 * Cookie-banner consent record version.
 * Bump when cookie categories or policy meaning change so the banner reappears.
 */
export const COOKIE_CONSENT_VERSION = LEGAL_POLICY_VERSION;

export const LEGAL_CONSENT_SOURCE_SIGNUP = "signup" as const;

export const LEGAL_CONSENT_ERROR =
  "You must agree to the Terms & Conditions and acknowledge the Privacy Policy.";

export const LEGAL_CONTACTS = {
  privacy: "privacy@mapesim.com",
  legal: "legal@mapesim.com",
  support: "support@mapesim.com",
  security: "security@mapesim.com",
  orders: "orders@mapesim.com",
  billing: "billing@mapesim.com",
} as const;

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Optional callout (e.g. placeholder or status note). */
  callout?: string;
};
