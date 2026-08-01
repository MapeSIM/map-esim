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
    const stripped = code.toLowerCase().replace(/^region-/, "");
    return slugifyDestination(stripped || name);
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

export function normalizeDestination(raw: unknown): VesimDestination | null {
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

  return {
    code: resolvedCode,
    name: name || resolvedCode,
    flag: typeof item.flag === "string" ? item.flag : undefined,
    regions: asArray(item.regions).filter(
      (region): region is string => typeof region === "string"
    ),
    minPrice:
      typeof item.minPrice === "number"
        ? item.minPrice
        : typeof item.minPriceUSD === "number"
          ? item.minPriceUSD
          : null,
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
      typeof item.minPriceFormatted === "string"
        ? item.minPriceFormatted
        : undefined,
    slug,
    kind,
  };
}

export function normalizeDestinations(payload: unknown): VesimDestination[] {
  return extractDestinations(payload)
    .map(normalizeDestination)
    .filter((item): item is VesimDestination => item !== null);
}

export function findDestinationBySlug(
  destinations: VesimDestination[],
  slug: string
): VesimDestination | undefined {
  const key = slugifyDestination(slug);
  if (!key) return undefined;

  return destinations.find((destination) => {
    if (destination.slug === key) return true;
    if (destination.code.toLowerCase() === key) return true;
    if (destination.code.toLowerCase() === `region-${key}`) return true;
    if (slugifyDestination(destination.name) === key) return true;
    return (destination.searchAliases || []).some(
      (alias) => slugifyDestination(alias) === key
    );
  });
}
