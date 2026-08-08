export type BrandId = "apple" | "samsung" | "pixel" | "other";

export type CompatibilityStatus =
  | "likely"
  | "may_depend"
  | "not_confirmed";

export type DeviceFamily = {
  id: string;
  label: string;
  status: CompatibilityStatus;
};

export const COMPATIBILITY_DISCLAIMER =
  "eSIM support can vary by model, region, carrier lock, and device configuration. Check your device settings or manufacturer documentation before purchase.";

export const RESULT_LABELS: Record<CompatibilityStatus, string> = {
  likely: "Likely compatible",
  may_depend: "May depend on model/region/carrier",
  not_confirmed: "Not confirmed / check manually",
};

export const BRAND_OPTIONS: Array<{ id: BrandId; label: string }> = [
  { id: "apple", label: "Apple" },
  { id: "samsung", label: "Samsung" },
  { id: "pixel", label: "Google Pixel" },
  { id: "other", label: "Other / Not sure" },
];

/** Curated, conservative families only — do not invent unsupported variants. */
export const DEVICE_FAMILIES: Record<
  Exclude<BrandId, "other">,
  DeviceFamily[]
> = {
  apple: [
    { id: "iphone-16", label: "iPhone 16 series", status: "likely" },
    { id: "iphone-15", label: "iPhone 15 series", status: "likely" },
    { id: "iphone-14", label: "iPhone 14 series", status: "likely" },
    { id: "iphone-13", label: "iPhone 13 series", status: "likely" },
    { id: "iphone-12", label: "iPhone 12 series", status: "likely" },
    { id: "iphone-11", label: "iPhone 11 series", status: "likely" },
    {
      id: "iphone-xs-xr",
      label: "iPhone XS, XS Max, or XR",
      status: "likely",
    },
    {
      id: "iphone-se-2-3",
      label: "iPhone SE (2nd or 3rd generation)",
      status: "likely",
    },
    {
      id: "iphone-regional",
      label: "Regional / dual physical SIM iPhone variant",
      status: "may_depend",
    },
    {
      id: "iphone-older",
      label: "iPhone X or earlier",
      status: "not_confirmed",
    },
    {
      id: "apple-not-listed",
      label: "My Apple model is not listed",
      status: "not_confirmed",
    },
  ],
  samsung: [
    {
      id: "galaxy-s24-s25",
      label: "Galaxy S24 or S25 series",
      status: "may_depend",
    },
    {
      id: "galaxy-s22-s23",
      label: "Galaxy S22 or S23 series",
      status: "may_depend",
    },
    {
      id: "galaxy-s21",
      label: "Galaxy S21 series",
      status: "may_depend",
    },
    {
      id: "galaxy-z",
      label: "Galaxy Z Fold or Z Flip series",
      status: "may_depend",
    },
    {
      id: "samsung-not-listed",
      label: "My Samsung model is not listed",
      status: "not_confirmed",
    },
  ],
  pixel: [
    { id: "pixel-9", label: "Pixel 9 series (including 9a)", status: "likely" },
    { id: "pixel-8", label: "Pixel 8 series (including 8a)", status: "likely" },
    { id: "pixel-7", label: "Pixel 7 series (including 7a)", status: "likely" },
    { id: "pixel-6", label: "Pixel 6 series (including 6a)", status: "likely" },
    {
      id: "pixel-4-5",
      label: "Pixel 4 or Pixel 5 series",
      status: "may_depend",
    },
    {
      id: "pixel-3",
      label: "Pixel 3 series",
      status: "may_depend",
    },
    {
      id: "pixel-not-listed",
      label: "My Pixel model is not listed",
      status: "not_confirmed",
    },
  ],
};

export function installGuideForBrand(
  brand: BrandId
): { href: string; label: string }[] {
  if (brand === "apple") {
    return [{ href: "/install/iphone", label: "iPhone installation guide" }];
  }
  if (brand === "samsung" || brand === "pixel") {
    return [{ href: "/install/android", label: "Android installation guide" }];
  }
  return [
    { href: "/install/iphone", label: "iPhone installation guide" },
    { href: "/install/android", label: "Android installation guide" },
  ];
}
