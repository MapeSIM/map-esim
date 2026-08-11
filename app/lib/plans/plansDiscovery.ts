import type { VesimDestination } from "@/app/lib/vesim/destinations";

/**
 * Neutral /plans featured destinations from the trusted public catalog.
 * Popular countries + global packs only — never invents offers or defaults to PK.
 */
export function selectPlansDiscoveryDestinations(
  destinations: readonly VesimDestination[]
): VesimDestination[] {
  const popularCountries = destinations
    .filter((item) => item.kind === "country" && item.isPopular === true)
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

/** Sorted catalog options for the /plans destination selector. */
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
