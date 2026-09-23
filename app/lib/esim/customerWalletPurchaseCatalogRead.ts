/**
 * Customer wallet Buy Now destination browse — public cached catalog.
 * Prepare/confirm still use live verifyOfferAuthoritative (pricing/security).
 * Admin assignment flows keep live fetchDestinations via adminPackageAssignmentRead.
 */
import "server-only";

import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";
import { fetchPublicDestinationCatalog } from "@/app/lib/vesim/server";

export type CustomerWalletBuyDestinationOption = {
  code: string;
  name: string;
  kind: string;
  flag?: string;
  isPopular?: boolean;
  slug?: string;
  searchAliases?: string[];
};

/**
 * Customer Buy Now destination picker — public cached catalog (not live VeSIM).
 */
export async function listCustomerWalletBuyDestinations(): Promise<
  CustomerWalletBuyDestinationOption[]
> {
  try {
    const destinations = await fetchPublicDestinationCatalog();
    return destinations
      .filter((d) => Boolean(d.code?.trim()))
      .slice(0, 400)
      .map((d) => ({
        code: d.code,
        name: destinationDisplayName(d),
        kind: d.kind,
        flag: d.flag,
        isPopular: d.isPopular === true,
        slug: d.slug,
        searchAliases: d.searchAliases,
      }));
  } catch {
    return [];
  }
}
