/** Shared validation limits for the public partnership application form. */

export const PARTNERSHIP_NAME_MIN = 2;
export const PARTNERSHIP_NAME_MAX = 80;
export const PARTNERSHIP_COMPANY_MIN = 2;
export const PARTNERSHIP_COMPANY_MAX = 120;
export const PARTNERSHIP_REGISTRATION_MAX = 80;
export const PARTNERSHIP_EMAIL_MAX = 254;
export const PARTNERSHIP_PHONE_MIN = 7;
export const PARTNERSHIP_PHONE_MAX = 32;
export const PARTNERSHIP_COUNTRY_MIN = 2;
export const PARTNERSHIP_COUNTRY_MAX = 80;
export const PARTNERSHIP_POSTAL_MIN = 2;
export const PARTNERSHIP_POSTAL_MAX = 24;
export const PARTNERSHIP_WEBSITE_MAX = 200;
export const PARTNERSHIP_ABOUT_MIN = 20;
export const PARTNERSHIP_ABOUT_MAX = 4000;

export const PARTNERSHIP_VOLUME_OPTIONS = [
  "exploring",
  "under_50",
  "50_200",
  "200_1000",
  "1000_plus",
] as const;

export type PartnershipVolumeOption =
  (typeof PARTNERSHIP_VOLUME_OPTIONS)[number];

export function partnershipVolumeLabel(
  value: PartnershipVolumeOption | string
): string {
  switch (value) {
    case "exploring":
      return "Exploring / not sure yet";
    case "under_50":
      return "Under 50 orders / month";
    case "50_200":
      return "50–200 orders / month";
    case "200_1000":
      return "200–1,000 orders / month";
    case "1000_plus":
      return "1,000+ orders / month";
    default:
      return "Not specified";
  }
}

export function parsePartnershipVolume(
  raw: unknown
): PartnershipVolumeOption | null {
  const value = String(raw ?? "").trim();
  return (PARTNERSHIP_VOLUME_OPTIONS as readonly string[]).includes(value)
    ? (value as PartnershipVolumeOption)
    : null;
}

/** Max successful/attempted submissions per IP window. */
export const PARTNERSHIP_RATE_LIMIT_MAX = 5;
export const PARTNERSHIP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Suppress identical content resubmits. */
export const PARTNERSHIP_DEDUP_WINDOW_MS = 15 * 60 * 1000;
