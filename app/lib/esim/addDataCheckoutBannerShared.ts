/**
 * Pure Add Data / checkout banner helpers (offline-QA safe).
 */

export type AddDataCheckoutBannerVariant = "topup" | "expired";

export function normalizeIccidLast4ForBanner(
  raw: string | null | undefined
): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function formatAddDataTopUpEsimLabel(
  iccidLast4: string | null | undefined
): string {
  const last4 = normalizeIccidLast4ForBanner(iccidLast4);
  return last4 ? `eSIM ···${last4}` : "your existing eSIM";
}

export const ADD_DATA_TOPUP_BANNER_TITLE = "Adding Data to Existing eSIM";

export function addDataTopUpBannerBody(
  iccidLast4: string | null | undefined
): string {
  const label = formatAddDataTopUpEsimLabel(iccidLast4);
  return `This plan will be added to your existing eSIM (${label}). Your current data will be used first, then the new plan will activate automatically.`;
}

export const ADD_DATA_EXPIRED_BANNER_TITLE =
  "This eSIM has Expired and cannot be recharged";

export const ADD_DATA_EXPIRED_BANNER_BODY =
  "You can still purchase a new eSIM. Continuing checkout will create a new eSIM instead of topping up the expired one.";

export function parseAddDataCheckoutBannerParam(
  raw: string | null | undefined
): AddDataCheckoutBannerVariant | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "topup" || value === "expired") return value;
  return null;
}
