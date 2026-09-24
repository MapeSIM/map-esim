import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Partner Catalog page removed — partners use the public destinations listing.
 * Keeps old bookmarks working without changing payment/checkout routes under
 * /partner/catalog/payment/*.
 */
export default function PartnerCatalogPage() {
  redirect("/countries");
}
