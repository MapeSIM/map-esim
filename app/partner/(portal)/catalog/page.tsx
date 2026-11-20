import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import {
  listPartnerApiDestinations,
  listPartnerApiOffers,
} from "@/app/lib/partnerApi/partnerApiCatalog";
import { sanitizeCountryHint } from "@/app/lib/vesim/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type KindFilter = "ALL" | "COUNTRY" | "REGIONAL" | "GLOBAL";

function parseKind(raw: string | null | undefined): KindFilter {
  const v = (raw ?? "ALL").trim().toUpperCase();
  if (v === "COUNTRY" || v === "REGIONAL" || v === "GLOBAL") return v;
  return "ALL";
}

export default async function PartnerCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    country?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return <p className="text-sm text-slate-300">Partner access is unavailable.</p>;
  }

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const country = sanitizeCountryHint(sp.country);
  const kind = parseKind(sp.kind);
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: actor.partnerId },
    select: { discountBps: true },
  });
  const discountBps = profile?.discountBps ?? 0;

  const destinations = await listPartnerApiDestinations({ discountBps });
  const destByCode = new Map(destinations.map((d) => [d.code, d]));

  const offersResult = await listPartnerApiOffers({
    discountBps,
    page,
    limit: 50,
    country,
    search: q || null,
    fullCatalog: !country,
  });

  let offers = offersResult.offers;
  if (kind !== "ALL") {
    offers = offers.filter((o) => {
      const dest = destByCode.get(o.destinationCode);
      const destKind = (dest?.kind ?? "").toLowerCase();
      if (kind === "COUNTRY") {
        return destKind === "country" || (!destKind && !o.destinationCode.startsWith("region-"));
      }
      if (kind === "REGIONAL") {
        return destKind === "regional" || o.destinationCode.startsWith("region-");
      }
      return destKind === "global" || o.destinationCode === "global";
    });
  }

  function href(next: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      q: q || undefined,
      country: country || undefined,
      kind: kind === "ALL" ? undefined : kind,
      page: page > 1 ? String(page) : undefined,
      ...next,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/partner/catalog?${qs}` : "/partner/catalog";
  }

  const kindTabs: Array<{ id: KindFilter; label: string }> = [
    { id: "ALL", label: "All Plans" },
    { id: "COUNTRY", label: "Country" },
    { id: "REGIONAL", label: "Regional" },
    { id: "GLOBAL", label: "Global" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Catalog</h1>
          <p className="mt-1 text-sm text-slate-400">
            Partner wholesale USD pricing after your discount.
          </p>
        </div>
        <a
          href="/api/partner/catalog/csv"
          className="inline-flex h-10 items-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950"
        >
          All plans CSV
        </a>
      </header>

      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto]" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search plans / destinations"
          className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        />
        <select
          name="country"
          defaultValue={country ?? ""}
          className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
        >
          <option value="">All destinations</option>
          {destinations.map((d) => (
            <option key={d.code} value={d.code}>
              {d.name} ({d.code})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-11 rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-100 hover:border-emerald-500/40"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {kindTabs.map((tab) => (
          <Link
            key={tab.id}
            href={href({ kind: tab.id === "ALL" ? undefined : tab.id, page: undefined })}
            className={`inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ${
              kind === tab.id
                ? "bg-emerald-400 text-slate-950"
                : "border border-slate-700 text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {offers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 px-5 py-8 text-sm text-slate-400">
          No plans match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-3 font-semibold">Plan</th>
                <th className="px-3 py-3 font-semibold">Destination</th>
                <th className="px-3 py-3 font-semibold">Data</th>
                <th className="px-3 py-3 font-semibold">Validity</th>
                <th className="px-3 py-3 font-semibold">Partner USD</th>
                <th className="px-3 py-3 font-semibold">Buy</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={`${offer.offerId}-${offer.destinationCode}`} className="border-t border-slate-800">
                  <td className="px-3 py-3 text-slate-100">{offer.name}</td>
                  <td className="px-3 py-3 text-slate-300">
                    {offer.destinationLabel}
                  </td>
                  <td className="px-3 py-3 text-slate-300">{offer.dataLabel}</td>
                  <td className="px-3 py-3 text-slate-300">
                    {offer.validityLabel}
                  </td>
                  <td className="px-3 py-3 font-semibold tabular-nums text-emerald-300">
                    {offer.partnerPriceLabel}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/partner/buy?offerId=${encodeURIComponent(offer.offerId)}&country=${encodeURIComponent(offer.destinationCode)}`}
                      className="inline-flex h-8 items-center rounded-lg bg-emerald-400/90 px-2.5 text-xs font-semibold text-slate-950"
                    >
                      Buy
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {offersResult.totalPages > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Catalog pagination">
          {page > 1 ? (
            <Link
              href={href({ page: String(page - 1) })}
              className="inline-flex h-9 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold"
            >
              Previous
            </Link>
          ) : null}
          <span className="inline-flex h-9 items-center text-sm text-slate-400">
            Page {offersResult.page} / {offersResult.totalPages}
          </span>
          {page < offersResult.totalPages ? (
            <Link
              href={href({ page: String(page + 1) })}
              className="inline-flex h-9 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
