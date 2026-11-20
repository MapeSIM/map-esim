import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  normalizeOfferId,
  sanitizeCountryHint,
} from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";

/**
 * Legacy Partner catalog entry.
 * Deep-link checkout params → confirm page; otherwise → partner countries browse.
 * Keeps old /partner/catalog links working after the countries storefront move.
 */
export default async function PartnerCatalogRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; offerId?: string }>;
}) {
  await requireRole("PARTNER");
  const query = await searchParams;
  const country = sanitizeCountryHint(query.country);
  const offerId = normalizeOfferId(query.offerId);

  if (offerId && country) {
    redirect(
      `/partner/buy?offerId=${encodeURIComponent(offerId)}&country=${encodeURIComponent(country)}`
    );
  }

  if (country) {
    redirect(
      `/partner/countries?q=${encodeURIComponent(country)}`
    );
  }

  redirect("/partner/countries");
}
