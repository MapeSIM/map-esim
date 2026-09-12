/** Shared progressive-disclosure install copy. No secrets. No provider calls. */

export const ESIM_READY_TO_INSTALL = "Ready to install";

export const ONE_TAP_FALLBACK =
  "If automatic install does not open, use Manual Install or the Installation Guide.";

export const INSTALL_SHEET_STEPS_IPHONE = [
  "Tap Install eSIM",
  "Review & Confirm",
  "Wait for installation",
  "Select eSIM for mobile data",
  "Enable Data Roaming when required",
] as const;

export const INSTALL_SHEET_STEPS_GENERIC = [
  "Scan the QR code or open Manual Install",
  "Review & Confirm on your device",
  "Wait for installation",
  "Select eSIM for mobile data",
  "Enable Data Roaming when required",
] as const;
