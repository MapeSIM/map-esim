/**
 * eSIM device compatibility catalog (guidance only — offline-QA safe).
 * Not a guarantee for every regional SKU.
 */

export const ESIM_COMPAT_BRAND_FILTERS = [
  "All",
  "Apple",
  "Samsung",
  "Google",
  "Other",
] as const;

export type EsimCompatBrandFilter = (typeof ESIM_COMPAT_BRAND_FILTERS)[number];

export type EsimCompatDevice = {
  id: string;
  brand: Exclude<EsimCompatBrandFilter, "All">;
  name: string;
  aliases: readonly string[];
  supported: boolean;
  /** Shown on the result card when supported (e.g. China dual-SIM caveat). */
  note?: string;
};

const IPHONE_CHINA_NOTE =
  "Exclude China Mainland / Hong Kong / Macao physical dual-SIM models — those often lack eSIM. Unlocked (including Non-PTA) iPhones work abroad when eSIM is present.";

function apple(
  name: string,
  aliases: string[] = [],
  supported = true
): EsimCompatDevice {
  return {
    id: `apple-${name.toLowerCase().replace(/\s+/g, "-")}`,
    brand: "Apple",
    name,
    aliases,
    supported,
    note: supported ? IPHONE_CHINA_NOTE : undefined,
  };
}

function samsung(
  name: string,
  aliases: string[] = [],
  supported = true
): EsimCompatDevice {
  return {
    id: `samsung-${name.toLowerCase().replace(/\s+/g, "-")}`,
    brand: "Samsung",
    name,
    aliases,
    supported,
  };
}

function google(
  name: string,
  aliases: string[] = [],
  supported = true
): EsimCompatDevice {
  return {
    id: `google-${name.toLowerCase().replace(/\s+/g, "-")}`,
    brand: "Google",
    name,
    aliases,
    supported,
  };
}

function other(
  name: string,
  aliases: string[] = [],
  supported = true
): EsimCompatDevice {
  return {
    id: `other-${name.toLowerCase().replace(/\s+/g, "-")}`,
    brand: "Other",
    name,
    aliases,
    supported,
  };
}

/** Curated list covering mainstream eSIM-capable phones through ~2026. */
export const ESIM_COMPAT_DEVICES: readonly EsimCompatDevice[] = [
  // —— Apple unsupported ——
  apple("iPhone 7", ["iphone7"], false),
  apple("iPhone 8", ["iphone8"], false),
  apple("iPhone X", ["iphone x", "iphonex"], false),
  apple("iPhone SE (1st generation)", ["iphone se 2016", "iphone se1"], false),

  // —— Apple supported ——
  apple("iPhone XS", ["iphone xs"]),
  apple("iPhone XS Max", ["iphone xs max"]),
  apple("iPhone XR", ["iphone xr"]),
  apple("iPhone 11", ["iphone 11"]),
  apple("iPhone 11 Pro", ["iphone 11 pro"]),
  apple("iPhone 11 Pro Max", ["iphone 11 pro max"]),
  apple("iPhone SE (2nd generation)", ["iphone se 2020", "iphone se2"]),
  apple("iPhone 12", ["iphone 12"]),
  apple("iPhone 12 mini", ["iphone 12 mini"]),
  apple("iPhone 12 Pro", ["iphone 12 pro"]),
  apple("iPhone 12 Pro Max", ["iphone 12 pro max"]),
  apple("iPhone 13", ["iphone 13"]),
  apple("iPhone 13 mini", ["iphone 13 mini"]),
  apple("iPhone 13 Pro", ["iphone 13 pro"]),
  apple("iPhone 13 Pro Max", ["iphone 13 pro max"]),
  apple("iPhone SE (3rd generation)", ["iphone se 2022", "iphone se3"]),
  apple("iPhone 14", ["iphone 14"]),
  apple("iPhone 14 Plus", ["iphone 14 plus"]),
  apple("iPhone 14 Pro", ["iphone 14 pro"]),
  apple("iPhone 14 Pro Max", ["iphone 14 pro max"]),
  apple("iPhone 15", ["iphone 15"]),
  apple("iPhone 15 Plus", ["iphone 15 plus"]),
  apple("iPhone 15 Pro", ["iphone 15 pro"]),
  apple("iPhone 15 Pro Max", ["iphone 15 pro max"]),
  apple("iPhone 16", ["iphone 16"]),
  apple("iPhone 16 Plus", ["iphone 16 plus"]),
  apple("iPhone 16 Pro", ["iphone 16 pro"]),
  apple("iPhone 16 Pro Max", ["iphone 16 pro max"]),
  apple("iPhone 16e", ["iphone 16e"]),
  apple("iPhone 17", ["iphone 17"]),
  apple("iPhone 17 Air", ["iphone 17 air", "iphone air"]),
  apple("iPhone 17 Pro", ["iphone 17 pro"]),
  apple("iPhone 17 Pro Max", ["iphone 17 pro max"]),

  // —— Samsung unsupported ——
  samsung("Galaxy S10", ["s10", "galaxy s10"], false),
  samsung("Galaxy S10e", ["s10e"], false),
  samsung("Galaxy S9", ["s9", "galaxy s9"], false),
  samsung("Galaxy Note 10", ["note 10"], false),

  // —— Samsung supported ——
  samsung("Galaxy S20", ["s20", "galaxy s20"]),
  samsung("Galaxy S20+", ["s20+", "s20 plus"]),
  samsung("Galaxy S20 Ultra", ["s20 ultra"]),
  samsung("Galaxy S21", ["s21"]),
  samsung("Galaxy S21+", ["s21+", "s21 plus"]),
  samsung("Galaxy S21 Ultra", ["s21 ultra"]),
  samsung("Galaxy S22", ["s22"]),
  samsung("Galaxy S22+", ["s22+", "s22 plus"]),
  samsung("Galaxy S22 Ultra", ["s22 ultra"]),
  samsung("Galaxy S23", ["s23"]),
  samsung("Galaxy S23+", ["s23+", "s23 plus"]),
  samsung("Galaxy S23 Ultra", ["s23 ultra"]),
  samsung("Galaxy S23 FE", ["s23 fe"]),
  samsung("Galaxy S24", ["s24"]),
  samsung("Galaxy S24+", ["s24+", "s24 plus"]),
  samsung("Galaxy S24 Ultra", ["s24 ultra"]),
  samsung("Galaxy S24 FE", ["s24 fe"]),
  samsung("Galaxy S25", ["s25"]),
  samsung("Galaxy S25+", ["s25+", "s25 plus"]),
  samsung("Galaxy S25 Ultra", ["s25 ultra"]),
  samsung("Galaxy S26", ["s26"]),
  samsung("Galaxy S26+", ["s26+", "s26 plus"]),
  samsung("Galaxy S26 Ultra", ["s26 ultra"]),
  samsung("Galaxy Z Fold3", ["z fold 3", "fold 3"]),
  samsung("Galaxy Z Fold4", ["z fold 4", "fold 4"]),
  samsung("Galaxy Z Fold5", ["z fold 5", "fold 5"]),
  samsung("Galaxy Z Fold6", ["z fold 6", "fold 6"]),
  samsung("Galaxy Z Fold7", ["z fold 7", "fold 7"]),
  samsung("Galaxy Z Flip3", ["z flip 3", "flip 3"]),
  samsung("Galaxy Z Flip4", ["z flip 4", "flip 4"]),
  samsung("Galaxy Z Flip5", ["z flip 5", "flip 5"]),
  samsung("Galaxy Z Flip6", ["z flip 6", "flip 6"]),
  samsung("Galaxy Z Flip7", ["z flip 7", "flip 7"]),

  // —— Google ——
  google("Pixel 2", ["pixel 2"], false),
  google("Pixel 3", ["pixel 3"]),
  google("Pixel 3 XL", ["pixel 3 xl"]),
  google("Pixel 3a", ["pixel 3a"]),
  google("Pixel 4", ["pixel 4"]),
  google("Pixel 4 XL", ["pixel 4 xl"]),
  google("Pixel 4a", ["pixel 4a"]),
  google("Pixel 5", ["pixel 5"]),
  google("Pixel 5a", ["pixel 5a"]),
  google("Pixel 6", ["pixel 6"]),
  google("Pixel 6 Pro", ["pixel 6 pro"]),
  google("Pixel 6a", ["pixel 6a"]),
  google("Pixel 7", ["pixel 7"]),
  google("Pixel 7 Pro", ["pixel 7 pro"]),
  google("Pixel 7a", ["pixel 7a"]),
  google("Pixel 8", ["pixel 8"]),
  google("Pixel 8 Pro", ["pixel 8 pro"]),
  google("Pixel 8a", ["pixel 8a"]),
  google("Pixel 9", ["pixel 9"]),
  google("Pixel 9 Pro", ["pixel 9 pro"]),
  google("Pixel 9 Pro XL", ["pixel 9 pro xl"]),
  google("Pixel 9a", ["pixel 9a"]),
  google("Pixel 10", ["pixel 10"]),
  google("Pixel 10 Pro", ["pixel 10 pro"]),

  // —— Other ——
  other("Motorola Razr (2019+)", ["motorola razr", "razr"]),
  other("Motorola Edge+", ["motorola edge+", "edge plus"]),
  other("Motorola Edge 40", ["edge 40"]),
  other("Oppo Find X3 Pro", ["find x3 pro", "oppo find x3"]),
  other("Oppo Find X5 Pro", ["find x5 pro"]),
  other("Oppo Find X6 Pro", ["find x6 pro"]),
  other("Oppo Find X7", ["find x7"]),
  other("Xiaomi 12T Pro", ["xiaomi 12t pro", "12t pro"]),
  other("Xiaomi 13", ["xiaomi 13"]),
  other("Xiaomi 13 Pro", ["xiaomi 13 pro"]),
  other("Xiaomi 14", ["xiaomi 14"]),
  other("Xiaomi 14 Pro", ["xiaomi 14 pro"]),
  other("Xiaomi 15", ["xiaomi 15"]),
  other("Nothing Phone (2)", ["nothing phone 2", "nothing phone (2)"]),
  other("Nothing Phone (2a)", ["nothing phone 2a"]),
  other("Sony Xperia 1 V", ["xperia 1 v", "sony xperia 1v"]),
  other("Sony Xperia 1 VI", ["xperia 1 vi"]),
  other("Huawei P40", ["huawei p40", "p40"], false),
  other("OnePlus 7 Pro", ["oneplus 7 pro"], false),
];

export const ESIM_COMPAT_SEARCH_PLACEHOLDER =
  "Type your phone model, e.g. iPhone 15 Pro, S24...";

export const ESIM_COMPAT_EID_CHECK =
  "Dial *#06# — if a 32-digit EID appears, your phone supports eSIM.";

export const ESIM_COMPAT_CARRIER_LOCK_CHECK =
  'Settings → General → About → Carrier Lock must say "No SIM restrictions". JV / carrier-locked phones are not supported. Unlocked (including Non-PTA) iPhones work 100% abroad when eSIM is present.';

export const ESIM_COMPAT_UNKNOWN_MESSAGE =
  "We couldn’t match that model in our list. Use the *#06# EID check below before you buy — regional variants can differ.";

function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[+]/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterEsimCompatDevices(input: {
  brand: EsimCompatBrandFilter;
  query: string;
}): EsimCompatDevice[] {
  const q = normalizeQuery(input.query);
  return ESIM_COMPAT_DEVICES.filter((device) => {
    if (input.brand !== "All" && device.brand !== input.brand) return false;
    if (!q) return true;
    const haystack = normalizeQuery(
      [device.name, ...device.aliases, device.brand].join(" ")
    );
    return haystack.includes(q) || q.split(" ").every((part) => haystack.includes(part));
  });
}

/** Best single match for free-text search (exact-ish preference). */
export function matchEsimCompatDevice(
  query: string
): EsimCompatDevice | null {
  const q = normalizeQuery(query);
  if (!q || q.length < 2) return null;

  const scored = ESIM_COMPAT_DEVICES.map((device) => {
    const name = normalizeQuery(device.name);
    const aliases = device.aliases.map(normalizeQuery);
    let score = 0;
    if (name === q) score = 100;
    else if (aliases.includes(q)) score = 95;
    else if (name.includes(q)) score = 80;
    else if (aliases.some((a) => a.includes(q) || q.includes(a))) score = 70;
    else if (q.split(" ").every((part) => name.includes(part))) score = 60;
    return { device, score };
  })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.device ?? null;
}
