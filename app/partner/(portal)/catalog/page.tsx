import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Partner catalog browse UI moved to the public destinations list.
 * Payment return/cancel routes under /partner/catalog/payment/* stay unchanged.
 */
export default function PartnerCatalogPage() {
  redirect("/countries");
}
