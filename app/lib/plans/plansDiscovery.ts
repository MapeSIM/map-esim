import {
  destinationPath,
  slugifyDestination,
  type VesimDestination,
} from "@/app/lib/vesim/destinations";

/**
 * Preferred /plans quick destinations (ISO order).
 * Only rendered when present in the trusted public catalog.
 */
export const PLANS_PRIORITY_DESTINATION_CODES = [
  "PK",
  "SA",
  "AE",
  "IQ",
  "GB",
  "MY",
  "TR",
  "QA",
] as const;

const PRIORITY_NAME_HINTS: Record<
  (typeof PLANS_PRIORITY_DESTINATION_CODES)[number],
  readonly string[]
> = {
  PK: ["pakistan"],
  SA: ["saudi-arabia", "saudi arabia"],
  AE: ["united-arab-emirates", "uae", "united arab emirates"],
  IQ: ["iraq"],
  GB: ["united-kingdom", "uk", "united kingdom", "great-britain"],
  MY: ["malaysia"],
  TR: ["turkey", "türkiye", "turkiye"],
  QA: ["qatar"],
};

/**
 * Neutral /plans featured destinations from the trusted public catalog.
 * Popular countries + global packs only — never invents offers or defaults to PK.
 */
export function selectPlansDiscoveryDestinations(
  destinations: readonly VesimDestination[],
  options?: { excludeCodes?: ReadonlySet<string> }
): VesimDestination[] {
  const exclude = options?.excludeCodes;

  const popularCountries = destinations
    .filter((item) => item.kind === "country" && item.isPopular === true)
    .filter((item) => !exclude?.has(item.code.trim().toUpperCase()))
    .slice()
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  const global = destinations
    .filter((item) => item.kind === "global")
    .slice()
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  return [...popularCountries, ...global];
}

/** Sorted catalog options for the /plans destination search. */
export function selectPlansDiscoverySelectorOptions(
  destinations: readonly VesimDestination[]
): VesimDestination[] {
  return destinations
    .filter(
      (item) =>
        item.kind === "country" ||
        item.kind === "regional" ||
        item.kind === "global"
    )
    .slice()
    .sort((a, b) => {
      const kindRank = (kind: VesimDestination["kind"]) =>
        kind === "country" ? 0 : kind === "regional" ? 1 : 2;
      const rank = kindRank(a.kind) - kindRank(b.kind);
      if (rank !== 0) return rank;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function destinationMatchesPriority(
  destination: VesimDestination,
  code: (typeof PLANS_PRIORITY_DESTINATION_CODES)[number]
): boolean {
  if (destination.kind !== "country") return false;
  if (destination.code.trim().toUpperCase() === code) return true;

  const hints = PRIORITY_NAME_HINTS[code];
  const slug = (destination.slug || slugifyDestination(destination.name)).toLowerCase();
  const nameSlug = slugifyDestination(destination.name);
  const aliases = (destination.searchAliases || []).map((alias) =>
    slugifyDestination(alias)
  );

  return hints.some((hint) => {
    const key = slugifyDestination(hint);
    return (
      slug === key ||
      nameSlug === key ||
      aliases.includes(key) ||
      destination.name.toLowerCase() === hint.toLowerCase()
    );
  });
}

/**
 * Priority chips for /plans — catalog intersection only, preferred order preserved.
 * Missing catalog entries are omitted (never invented).
 */
export function selectPlansPriorityDestinations(
  destinations: readonly VesimDestination[]
): VesimDestination[] {
  const countries = destinations.filter((item) => item.kind === "country");
  const selected: VesimDestination[] = [];
  const used = new Set<string>();

  for (const code of PLANS_PRIORITY_DESTINATION_CODES) {
    const match = countries.find(
      (item) =>
        !used.has(item.code.trim().toUpperCase()) &&
        destinationMatchesPriority(item, code)
    );
    if (!match) continue;
    used.add(match.code.trim().toUpperCase());
    selected.push(match);
  }

  return selected;
}

/** Case-insensitive destination search over name, code, slug, and aliases. */
export function filterPlansDiscoveryDestinations(
  destinations: readonly VesimDestination[],
  query: string
): VesimDestination[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...destinations];

  return destinations.filter((item) => {
    const haystacks = [
      item.name,
      item.code,
      item.slug,
      ...(item.searchAliases || []),
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return haystacks.some((value) => value.includes(q));
  });
}

export function plansDestinationHref(destination: VesimDestination): string {
  return destinationPath(destination);
}
