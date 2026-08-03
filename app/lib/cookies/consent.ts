import { COOKIE_CONSENT_VERSION } from "@/app/lib/legal";

export const COOKIE_CONSENT_NAME = "mapesim_cookie_consent";

/** ~6 months */
export const COOKIE_CONSENT_MAX_AGE_SEC = 60 * 60 * 24 * 183;

export type CookieConsentCategories = {
  essential: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type CookieConsentRecord = CookieConsentCategories & {
  version: string;
  timestamp: string;
};

export type OptionalCookieCategory = "preferences" | "analytics" | "marketing";

export function createConsentRecord(
  categories: Omit<CookieConsentCategories, "essential">
): CookieConsentRecord {
  return {
    version: COOKIE_CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    essential: true,
    preferences: Boolean(categories.preferences),
    analytics: Boolean(categories.analytics),
    marketing: Boolean(categories.marketing),
  };
}

export function acceptAllConsent(): CookieConsentRecord {
  return createConsentRecord({
    preferences: true,
    analytics: true,
    marketing: true,
  });
}

export function rejectNonEssentialConsent(): CookieConsentRecord {
  return createConsentRecord({
    preferences: false,
    analytics: false,
    marketing: false,
  });
}

/**
 * Parse and validate a consent cookie value.
 * Returns null for missing, malformed, or outdated versions (banner should reappear).
 */
export function parseCookieConsent(
  raw: string | undefined | null
): CookieConsentRecord | null {
  if (!raw || typeof raw !== "string") return null;

  try {
    const trimmed = raw.trim();
    let decoded = trimmed;
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      decoded = trimmed;
    }
    const data = JSON.parse(decoded) as Partial<CookieConsentRecord>;

    if (!data || typeof data !== "object") return null;
    if (data.version !== COOKIE_CONSENT_VERSION) return null;
    if (typeof data.timestamp !== "string" || !data.timestamp) return null;
    if (data.essential !== true) return null;
    if (typeof data.preferences !== "boolean") return null;
    if (typeof data.analytics !== "boolean") return null;
    if (typeof data.marketing !== "boolean") return null;

    // Reject unexpected personal-data-looking keys by rebuilding a clean record.
    return {
      version: data.version,
      timestamp: data.timestamp,
      essential: true,
      preferences: data.preferences,
      analytics: data.analytics,
      marketing: data.marketing,
    };
  } catch {
    return null;
  }
}

export function serializeCookieConsent(record: CookieConsentRecord): string {
  const clean: CookieConsentRecord = {
    version: record.version,
    timestamp: record.timestamp,
    essential: true,
    preferences: Boolean(record.preferences),
    analytics: Boolean(record.analytics),
    marketing: Boolean(record.marketing),
  };
  // URI-encode so spaces/quotes in version strings cannot break the cookie.
  return encodeURIComponent(JSON.stringify(clean));
}

export function hasOptionalConsent(
  record: CookieConsentRecord | null | undefined,
  category: OptionalCookieCategory
): boolean {
  if (!record || record.version !== COOKIE_CONSENT_VERSION) return false;
  return Boolean(record[category]);
}

/** Cookie attribute helper for document.cookie / Set-Cookie style writes. */
export function consentCookieAttributeString(): string {
  const secure =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";
  return `Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}
