import { redirect } from "next/navigation";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";

/**
 * Partner catalog browse UI moved to the public destinations list.
 * Payment return/cancel routes under /partner/catalog/payment/* stay unchanged.
 * Deep-links with offerId + country go to the Partner confirm-purchase page.
 */
export default async function PartnerCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ offerId?: string; country?: string }>;
}) {
  const query = await searchParams;
  const offerId = normalizeOfferId(query.offerId);
  const country = sanitizeCountryHint(query.country);

  if (offerId && country) {
    const params = new URLSearchParams({
      offerId,
      country,
    });
    redirect(`/partner/buy?${params.toString()}`);
  }

  redirect("/countries");
}
