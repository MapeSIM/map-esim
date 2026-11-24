import { redirect } from "next/navigation";
import SandboxStorefrontBuy from "@/app/components/sandbox/SandboxStorefrontBuy";

export const dynamic = "force-dynamic";

/**
 * Sandbox confirm purchase — Buy Now from /sandbox/catalog/[slug].
 * Never uses live /account/esim/buy or retail sign-in.
 */
export default async function SandboxBuyPage({
  searchParams,
}: {
  searchParams: Promise<{
    offerId?: string;
    country?: string;
    planName?: string;
    priceUsd?: string;
  }>;
}) {
  const query = await searchParams;
  const offerId = (query.offerId ?? "").trim();
  const country = (query.country ?? "").trim();
  if (!offerId) {
    redirect("/sandbox/catalog");
  }

  const priceRaw = Number.parseFloat((query.priceUsd ?? "").trim());
  const priceUsd = Number.isFinite(priceRaw) ? priceRaw : null;

  return (
    <SandboxStorefrontBuy
      offerId={offerId}
      country={country}
      planName={(query.planName ?? "").trim()}
      priceUsd={priceUsd}
    />
  );
}
