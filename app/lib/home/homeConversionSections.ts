/**
 * Homepage conversion copy (offline-QA safe; no Prisma / payments / prices).
 */

/** Shared public discovery CTA (Navbar, hero, final CTA, comparison follow-up). */
export const HOME_DISCOVERY_CTA_LABEL = "Get eSIM";
/** Soft-launch: land on Popular destinations; Country tab remains available. */
export const HOME_DISCOVERY_CTA_HREF = "/countries?filter=Popular";

export const HOME_POPULAR_SECTION_EYEBROW = "Destinations";
export const HOME_POPULAR_SECTION_TITLE = "Popular destinations";
export const HOME_POPULAR_SECTION_INTRO =
  "Start with frequently chosen travel destinations, then compare plans on the country page.";

export const HOME_POPULAR_DESTINATIONS = [
  { id: "pakistan", name: "Pakistan", code: "PK" },
  { id: "saudi-arabia", name: "Saudi Arabia", code: "SA" },
  { id: "uae", name: "United Arab Emirates", code: "AE" },
  { id: "turkey", name: "Turkey", code: "TR" },
  { id: "united-kingdom", name: "United Kingdom", code: "GB" },
  { id: "united-states", name: "United States", code: "US" },
  { id: "france", name: "France", code: "FR" },
  { id: "germany", name: "Germany", code: "DE" },
] as const;

/**
 * Display-only pin order for Popular destination UIs.
 * Codes missing from a given list are skipped; remaining stay after these.
 */
export const POPULAR_DESTINATION_DISPLAY_ORDER = [
  "PK",
  "SA",
  "AE",
  "MY",
  "TH",
  "TR",
  "GB",
  "US",
  "JP",
  "FR",
] as const;

export function popularDestinationDisplayRank(code: string): number {
  const normalized = code.trim().toUpperCase();
  const index = (POPULAR_DESTINATION_DISPLAY_ORDER as readonly string[]).indexOf(
    normalized
  );
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}

export const HOME_COMPARISON_EYEBROW = "Compare";
export const HOME_COMPARISON_TITLE = "Travel eSIM vs typical alternatives";
export const HOME_COMPARISON_INTRO =
  "A travel eSIM is a digital plan you can buy before you fly. This comparison is guidance only — roaming and airport shops vary by carrier and location.";

export const HOME_COMPARISON_COLUMNS = [
  "MAP eSIM",
  "Typical roaming",
  "Airport SIM shop",
] as const;

export const HOME_COMPARISON_ROWS = [
  {
    feature: "When you set up",
    values: [
      "Buy and install before you travel",
      "Uses your home line abroad",
      "Usually after you land",
    ],
  },
  {
    feature: "Physical SIM",
    values: [
      "Not required",
      "Keep your existing SIM",
      "Usually a physical SIM or eSIM at the counter",
    ],
  },
  {
    feature: "Plan browsing",
    values: [
      "Country, regional, and global plans",
      "Home-carrier roaming packages",
      "What the shop has in stock",
    ],
  },
  {
    feature: "Checkout",
    values: [
      "Verified offer details before the order",
      "Billed by your home carrier",
      "Pay at the shop",
    ],
  },
] as const;

export const HOME_FINAL_CTA_TITLE = "Ready to stay connected abroad?";
export const HOME_FINAL_CTA_BODY =
  "Browse destination plans, compare data and validity, then continue to checkout with verified offer details.";
export const HOME_FINAL_CTA_PRIMARY_HREF = HOME_DISCOVERY_CTA_HREF;
export const HOME_FINAL_CTA_PRIMARY_LABEL = HOME_DISCOVERY_CTA_LABEL;
export const HOME_FINAL_CTA_SECONDARY_HREF = "/how-it-works";
export const HOME_FINAL_CTA_SECONDARY_LABEL = "See how it works";
export const HOME_FINAL_CTA_POINTS = [
  "Digital delivery after purchase",
  "No physical SIM swap",
  "iPhone and Android install guides",
] as const;
