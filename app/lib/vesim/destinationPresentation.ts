/**
 * Customer-facing destination catalog presentation helpers.
 * Display-only — never mutate provider codes, slugs, paths, or pricing.
 */

export type DestinationPresentationInput = {
  code: string;
  name: string;
  flag?: string;
  kind?: "country" | "regional" | "global";
};

/**
 * Unambiguous ISO / territory labels used only when the provider name is
 * code-like (e.g. name === "SM"). Provider `code` stays unchanged.
 */
export const DESTINATION_CODE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  BT: "Bhutan",
  LY: "Libya",
  PF: "French Polynesia",
  SM: "San Marino",
  SX: "Sint Maarten",
  TL: "Timor-Leste",
};

/**
 * Distinct provider products that share a generic customer name.
 * Keep separate catalog rows; clarify the label only.
 */
export const DESTINATION_VARIANT_DISPLAY_NAMES: Readonly<
  Record<string, string>
> = {
  USPR: "Puerto Rico (US)",
};

/**
 * ISO-2 / exceptional codes with no reliable flagcdn asset.
 * Do not request broken images; do not invent a substitute national flag.
 */
export const FLAGCDN_UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  "AN", // Netherlands Antilles (dissolved; flagcdn 404)
  "IC", // Canary Islands (exceptional reservation; flagcdn 404)
]);

/** Provider emoji known to be the wrong national flag for the destination. */
const UNSAFE_FLAG_EMOJI_BY_CODE: Readonly<Record<string, ReadonlySet<string>>> =
  {
    // Provider sends Netherlands flag for dissolved Netherlands Antilles.
    AN: new Set(["🇳🇱"]),
  };

export function normalizeDestinationCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/** True when the provider name is effectively just the destination code. */
export function isCodeLikeDestinationName(
  name: string | null | undefined,
  code: string | null | undefined
): boolean {
  const n = (name ?? "").trim();
  const c = normalizeDestinationCode(code);
  if (!n) return Boolean(c);
  if (!c) return /^[A-Za-z]{2}$/.test(n);
  return n.toUpperCase() === c;
}

/**
 * Customer-facing label. Never changes provider code/slug/path identity.
 */
export function destinationDisplayName(
  destination: DestinationPresentationInput
): string {
  const code = normalizeDestinationCode(destination.code);
  const variant = DESTINATION_VARIANT_DISPLAY_NAMES[code];
  if (variant) return variant;

  if (
    isCodeLikeDestinationName(destination.name, destination.code) &&
    DESTINATION_CODE_DISPLAY_NAMES[code]
  ) {
    return DESTINATION_CODE_DISPLAY_NAMES[code];
  }

  const named = (destination.name ?? "").trim();
  return named || code || "Destination";
}

export function destinationFlagInitials(
  code: string | null | undefined
): string {
  const c = normalizeDestinationCode(code);
  if (!c) return "?";
  if (/^[A-Z0-9]{2,4}$/.test(c)) return c.slice(0, 4);
  return c.slice(0, 2);
}

/** flagcdn URL only when a 2-letter code is known to resolve. */
export function destinationFlagcdnUrl(
  code: string | null | undefined
): string | null {
  const c = normalizeDestinationCode(code);
  if (!/^[A-Z]{2}$/.test(c)) return null;
  if (FLAGCDN_UNSUPPORTED_CODES.has(c)) return null;
  return `https://flagcdn.com/w80/${c.toLowerCase()}.png`;
}

export function isRegionalIndicatorFlagEmoji(
  flag: string | null | undefined
): boolean {
  if (!flag) return false;
  return /\p{Regional_Indicator}/u.test(flag);
}

/**
 * Whether a provider emoji is safe to render for this destination.
 * Blocks known wrong national flags (e.g. Netherlands emoji for AN).
 */
export function isSafeDestinationFlagEmoji(
  code: string | null | undefined,
  flag: string | null | undefined
): boolean {
  if (!isRegionalIndicatorFlagEmoji(flag)) return false;
  const c = normalizeDestinationCode(code);
  const blocked = UNSAFE_FLAG_EMOJI_BY_CODE[c];
  if (blocked && flag && blocked.has(flag)) return false;
  // Dissolved AN: never show a national emoji substitute.
  if (c === "AN") return false;
  return true;
}

export type DestinationFlagVisual =
  | { type: "image"; src: string }
  | { type: "emoji"; emoji: string }
  | { type: "initials"; initials: string };

/**
 * Resolve flag presentation for country destinations.
 * Prefer flagcdn → safe emoji → initials (never a fabricated wrong flag).
 */
export function resolveDestinationFlagVisual(
  destination: DestinationPresentationInput
): DestinationFlagVisual {
  const kind = destination.kind ?? "country";
  if (kind !== "country") {
    return {
      type: "initials",
      initials: destinationFlagInitials(destination.code),
    };
  }

  const image = destinationFlagcdnUrl(destination.code);
  if (image) return { type: "image", src: image };

  if (isSafeDestinationFlagEmoji(destination.code, destination.flag)) {
    return { type: "emoji", emoji: destination.flag as string };
  }

  return {
    type: "initials",
    initials: destinationFlagInitials(destination.code),
  };
}
