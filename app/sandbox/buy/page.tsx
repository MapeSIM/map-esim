import { redirect } from "next/navigation";
import SandboxStorefrontBuy from "@/app/components/sandbox/SandboxStorefrontBuy";

export const dynamic = "force-dynamic";

/**
 * Sandbox confirm purchase — mirrors partneresim.com /partner/buy layout.
 * Issues a simulated Neon sandbox order only (no live supplier).
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
    <div className="space-y-6 [--heading:#f8fafc] [--surface:#0D1526] [--surface-2:#111827] [--text:#e2e8f0] [--text-muted:#94a3b8] [--border:rgba(255,255,255,0.08)] [--border-strong:rgba(255,255,255,0.12)]">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Confirm purchase
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Review retail price and the final Partner amount due, then confirm
          with Partner balance. Sandbox only — no live supplier order.
        </p>
      </header>
      <SandboxStorefrontBuy
        offerId={offerId}
        country={country}
        planName={(query.planName ?? "").trim()}
        priceUsd={priceUsd}
      />
    </div>
  );
}
