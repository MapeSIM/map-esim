/** Public brand constants for UI and copy. Domains/mailboxes stay mapesim.com. */

export const BRAND_NAME = "MAP eSIM";
export const BRAND_TAGLINE = "Global eSIM Connectivity";
export const BRAND_SITE_HOST = "mapesim.com";
export const BRAND_SITE_URL = "https://mapesim.com";
export const BRAND_SUPPORT_EMAIL = "support@mapesim.com";
export const BRAND_LOGO_ALT = "MAP eSIM – Global eSIM Connectivity"; // en dash per brand alt-text spec

/** Horizontal logo for dark backgrounds (white MAP + lime eSIM). */
export const BRAND_LOGO_DARK_PUBLIC_PATH = "/brand/map-esim-logo-dark.svg";

/** Horizontal logo for light backgrounds (navy MAP + lime eSIM). */
export const BRAND_LOGO_LIGHT_PUBLIC_PATH = "/brand/map-esim-logo-light.svg";

/** Icon-only mark (no wordmark). */
export const BRAND_MARK_PUBLIC_PATH = "/brand/map-esim-mark.svg";

/**
 * Backwards-compatible alias for email PNG/CID and any remaining PNG consumers.
 * Prefer BRAND_LOGO_DARK_PUBLIC_PATH / BRAND_LOGO_LIGHT_PUBLIC_PATH in UI.
 */
export const BRAND_LOGO_PUBLIC_PATH = "/brand/map-esim-logo.png";

/** Official social profiles — import these; do not hardcode URLs in JSX. */
export const BRAND_SOCIAL_LINKS = [
  {
    id: "instagram",
    label: "MAP eSIM on Instagram",
    href: "https://www.instagram.com/map.esim/",
  },
  {
    id: "facebook",
    label: "MAP eSIM on Facebook",
    href: "https://www.facebook.com/share/1EtvNuncnJ/?mibextid=wwXIfr",
  },
  {
    id: "tiktok",
    label: "MAP eSIM on TikTok",
    href: "https://www.tiktok.com/@mapesim",
  },
] as const;

export type BrandSocialLinkId = (typeof BRAND_SOCIAL_LINKS)[number]["id"];

/**
 * Footer payment-method badges. Keep false until a live gateway is approved.
 * Flip to true (and restore badge UI) after payment-gateway go-live.
 */
export const SHOW_FOOTER_PAYMENT_METHODS = false;
