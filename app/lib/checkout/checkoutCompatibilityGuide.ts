/**
 * Checkout + device-compatibility shared guidance (offline-QA safe).
 * Common model lists are guidance only — not a guarantee.
 */

export const CHECKOUT_COMPATIBILITY_TITLE = "Check eSIM compatibility";

export const CHECKOUT_COMPATIBILITY_INTRO =
  "Before paying, confirm your phone supports eSIM and is carrier-unlocked. This is guidance only — compatibility is not guaranteed for every device.";

export const COMMON_SUPPORTED_ESIM_MODELS = [
  {
    brand: "Apple iPhone",
    summary: "iPhone XR through iPhone 16 / 17 series",
    detail:
      "Most iPhone XR and newer models support eSIM. Exact support can vary by region and carrier configuration.",
  },
  {
    brand: "Google Pixel",
    summary: "Pixel 4 and newer",
    detail:
      "Pixel 4 and later generally include eSIM. Check Settings for “SIMs”, “SIM Manager”, or “Add eSIM”.",
  },
  {
    brand: "Samsung Galaxy",
    summary: "Galaxy S20+ and newer flagship / many Fold & Flip models",
    detail:
      "Galaxy S20+ and newer flagships commonly support eSIM. Some regional variants differ — verify in Settings before purchase.",
  },
] as const;

export const COMPATIBILITY_IPHONE_QUICK_CHECK = [
  "Open Settings",
  "Go to Cellular / Mobile Data / Mobile Service",
  "Look for “Add eSIM” or “Add Cellular Plan”",
] as const;

export const COMPATIBILITY_ANDROID_QUICK_CHECK = [
  "Open Settings",
  "Search for “eSIM”, “SIM Manager”, or “Add eSIM”",
  "Wording varies by manufacturer and device",
] as const;

export const COMPATIBILITY_UNLOCKED_NOTE =
  "A carrier-locked phone may support eSIM technically but may not accept another provider’s eSIM. Check Settings for carrier lock status where available, or contact your mobile carrier before you buy.";

export const DEVICE_COMPATIBILITY_PAGE_HREF = "/device-compatibility" as const;
