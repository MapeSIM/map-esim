import { calculateEntryRetailPriceUsd } from "@/app/lib/pricing/retailPrice";
import {
  isRecommendableRegionalCode,
  regionalCodeForCountryIso,
} from "@/app/lib/vesim/countryRegionalMap";
import { formatOfferPrice } from "@/app/lib/vesim/offers";

export type VesimDestination = {
  code: string;
  name: string;
  flag?: string;
  regions?: string[];
  minPrice?: number | null;
  offerCount?: number;
  isPopular?: boolean;
  isRegional?: boolean;
  isGlobal?: boolean;
  hasSmsVoice?: boolean;
  smsVoiceOfferCount?: number;
  searchAliases?: string[];
  minPriceFormatted?: string;
  slug: string;
  kind: "country" | "regional" | "global";
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function slugifyDestination(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function destinationSlug(raw: {
  code?: string;
  name?: string;
  isRegional?: boolean;
  isGlobal?: boolean;
}): string {
  const code = (raw.code || "").trim();
  const name = (raw.name || "").trim();

  if (raw.isGlobal || code.toLowerCase() === "global") {
    return "global";
  }

  if (raw.isRegional || code.toLowerCase().startsWith("region-")) {
    // Keep API regional codes in the URL (e.g. /countries/region-asia).
    if (code.toLowerCase().startsWith("region-")) {
      return code.toLowerCase();
    }
    return `region-${slugifyDestination(name || code)}`;
  }

  return slugifyDestination(name || code);
}

export function extractDestinations(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.destinations)) return root.destinations;
  if (Array.isArray(root.data)) return root.data;
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.destinations)) return nested.destinations;
    if (Array.isArray(nested.data)) return nested.data;
  }
  if (Array.isArray(root.result)) return root.result;
  return [];
}

function buildDestination(
  raw: unknown,
  options?: { applyEntryRetail?: boolean }
): VesimDestination | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const code =
    typeof item.code === "string" && item.code.trim()
      ? item.code.trim()
      : typeof item.country === "string"
        ? item.country.trim()
        : "";
  const name =
    typeof item.name === "string" && item.name.trim()
      ? item.name.trim()
      : typeof item.countryName === "string"
        ? item.countryName.trim()
        : "";

  if (!code && !name) return null;

  const codeLower = code.toLowerCase();
  const isRegional =
    item.isRegional === true ||
    codeLower.startsWith("region-") ||
    Boolean(
      asArray(item.regions).some(
        (region) =>
          typeof region === "string" &&
          /asia|europe|africa|america|middle east|caribbean|oceania|regional/i.test(
            region
          ) &&
          codeLower.startsWith("region-")
      )
    );
  // Never treat regional multi-country packs as global/worldwide plans.
  const isGlobal =
    !isRegional &&
    (item.isGlobal === true ||
      codeLower === "global" ||
      codeLower === "worldwide");

  const kind: VesimDestination["kind"] = isRegional
    ? "regional"
    : isGlobal
      ? "global"
      : "country";

  const resolvedCode = code || (isGlobal ? "global" : name);
  const slug = destinationSlug({
    code: resolvedCode,
    name,
    isRegional,
    isGlobal,
  });

  const rawMin =
    typeof item.minPrice === "number"
      ? item.minPrice
      : typeof item.minPriceUSD === "number"
        ? item.minPriceUSD
        : null;
  // Raw VeSIM list minPrice is supplier cost (no offer allowance). Entry-tier
  // retail is a fallback only; public catalog replaces it with lowest offer retail.
  const applyEntryRetail = options?.applyEntryRetail !== false;
  const retailMin =
    applyEntryRetail && rawMin != null
      ? calculateEntryRetailPriceUsd(rawMin)
      : null;
  const minPrice = applyEntryRetail ? retailMin ?? rawMin : rawMin;
  const currency =
    typeof item.currency === "string" && item.currency.trim()
      ? item.currency.trim()
      : "USD";

  return {
    code: resolvedCode,
    name: name || resolvedCode,
    flag: typeof item.flag === "string" ? item.flag : undefined,
    regions: asArray(item.regions).filter(
      (region): region is string => typeof region === "string"
    ),
    minPrice,
    offerCount:
      typeof item.offerCount === "number" ? item.offerCount : undefined,
    isPopular: item.isPopular === true,
    isRegional,
    isGlobal,
    hasSmsVoice: item.hasSmsVoice === true,
    smsVoiceOfferCount:
      typeof item.smsVoiceOfferCount === "number"
        ? item.smsVoiceOfferCount
        : undefined,
    searchAliases: asArray(item.searchAliases).filter(
      (alias): alias is string => typeof alias === "string"
    ),
    minPriceFormatted:
      minPrice != null
        ? formatOfferPrice(minPrice, currency)
        : typeof item.minPriceFormatted === "string"
          ? item.minPriceFormatted
          : undefined,
    slug,
    kind,
  };
}

export function normalizeDestination(raw: unknown): VesimDestination | null {
  return buildDestination(raw, { applyEntryRetail: true });
}

/**
 * Parse already-normalized public `/api/vesim/destinations` JSON.
 * Trusts `minPrice` as final MAP retail — do not re-apply entry markup.
 * Raw VeSIM payloads must continue to use `normalizeDestinations`.
 */
export function parsePublicDestination(raw: unknown): VesimDestination | null {
  return buildDestination(raw, { applyEntryRetail: false });
}

export function normalizeDestinations(payload: unknown): VesimDestination[] {
  return extractDestinations(payload)
    .map(normalizeDestination)
    .filter((item): item is VesimDestination => item !== null);
}

export function parsePublicDestinations(payload: unknown): VesimDestination[] {
  return extractDestinations(payload)
    .map(parsePublicDestination)
    .filter((item): item is VesimDestination => item !== null);
}

/**
 * Lowest MAP retail USD among buyable offers (already marked up once).
 * Used for authoritative "Starting from" — never re-derive from provider minPrice.
 */
export function lowestOfferRetailUsd(
  offers: Array<{ priceUSD?: number | null }>
): number | null {
  let min: number | null = null;
  for (const offer of offers) {
    const price = offer.priceUSD;
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      if (min == null || price < min) min = price;
    }
  }
  return min;
}

/**
 * Replace destination list minPrice with the cheapest offer's MAP retail.
 * Keeps entry-tier estimate only when no positive offer retail is available.
 */
export function withLowestOfferRetailMinPrice(
  destination: VesimDestination,
  offers: Array<{ priceUSD?: number | null }>
): VesimDestination {
  const lowest = lowestOfferRetailUsd(offers);
  if (lowest == null) return destination;
  return {
    ...destination,
    minPrice: lowest,
    minPriceFormatted: formatOfferPrice(lowest, "USD"),
    offerCount: offers.length > 0 ? offers.length : destination.offerCount,
  };
}

export function findDestinationBySlug(
  destinations: VesimDestination[],
  slug: string
): VesimDestination | undefined {
  const rawKey = slug.trim().toLowerCase();
  const key = slugifyDestination(slug);
  if (!rawKey && !key) return undefined;

  return destinations.find((destination) => {
    const codeLower = destination.code.toLowerCase();
    if (destination.slug === key || destination.slug === rawKey) return true;
    if (codeLower === key || codeLower === rawKey) return true;
    if (codeLower === `region-${key}`) return true;
    if (slugifyDestination(destination.name) === key) return true;
    // Backward-compatible: /countries/asia → region-asia
    if (
      destination.kind === "regional" &&
      codeLower === `region-${key}`
    ) {
      return true;
    }
    return (destination.searchAliases || []).some(
      (alias) => slugifyDestination(alias) === key || alias.toLowerCase() === rawKey
    );
  });
}

/**
 * Resolve the best matching regional destination for a country.
 * 1) Prefer live destination.regions metadata when present
 *    (e.g. Pakistan "South Asia" → region-asia).
 * 2) Fall back to ISO → VeSIM regional catalog map when metadata is empty.
 * Never invent a region when neither source resolves to a live regional.
 */
export function findRelatedRegionalDestination(
  country: VesimDestination,
  destinations: VesimDestination[]
): VesimDestination | undefined {
  if (country.kind !== "country") return undefined;

  const regionals = destinations.filter(
    (item) =>
      item.kind === "regional" && isRecommendableRegionalCode(item.code)
  );
  if (regionals.length === 0) return undefined;

  const fromMetadata = matchRegionalByCountryRegions(country, regionals);
  if (fromMetadata) return fromMetadata;

  const mappedCode = regionalCodeForCountryIso(country.code);
  if (!mappedCode) return undefined;

  return regionals.find(
    (item) => item.code.trim().toLowerCase() === mappedCode
  );
}

function matchRegionalByCountryRegions(
  country: VesimDestination,
  regionals: VesimDestination[]
): VesimDestination | undefined {
  const countryRegions = (country.regions || [])
    .map((region) => region.trim().toLowerCase())
    .filter(Boolean);

  if (countryRegions.length === 0) return undefined;

  let best: { destination: VesimDestination; score: number } | null = null;

  for (const regional of regionals) {
    const name = regional.name.trim().toLowerCase();
    const codeKey = regional.code
      .toLowerCase()
      .replace(/^region-/, "")
      .replace(/-/g, " ");
    const regionalLabels = Array.from(
      new Set(
        [name, codeKey, ...(regional.regions || []).map((r) => r.toLowerCase())]
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );

    let score = 0;

    for (const countryRegion of countryRegions) {
      for (const label of regionalLabels) {
        if (!label) continue;
        if (countryRegion === label) score += 20;
        else if (countryRegion.includes(label) || label.includes(countryRegion)) {
          score += 12;
        } else {
          const countryTokens = countryRegion.split(/[\s,/&-]+/).filter(Boolean);
          const labelTokens = label.split(/[\s,/&-]+/).filter(Boolean);
          if (
            labelTokens.some(
              (token) => token.length >= 4 && countryTokens.includes(token)
            )
          ) {
            score += 8;
          }
        }
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { destination: regional, score };
    }
  }

  return best?.destination;
}

export function destinationPath(destination: VesimDestination): string {
  const id =
    destination.kind === "regional" || destination.kind === "global"
      ? destination.code.toLowerCase()
      : destination.slug || slugifyDestination(destination.name);
  return `/countries/${id}`;
}
