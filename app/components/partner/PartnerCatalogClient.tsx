"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { PartnerApiOfferRow } from "@/app/lib/partnerApi/partnerApiCatalog";
import {
  partnerCardClass,
  partnerFieldClass,
  partnerPrimaryCtaClass,
} from "@/app/components/partner/partnerPortalUi";

type KindFilter = "ALL" | "COUNTRY" | "REGIONAL" | "GLOBAL";

function matchesKind(offer: PartnerApiOfferRow, kind: KindFilter): boolean {
  if (kind === "ALL") return true;
  const k = (offer.kind ?? "").toLowerCase();
  const code = offer.destinationCode.toLowerCase();
  if (kind === "REGIONAL") {
    return k === "regional" || code.startsWith("region-");
  }
  if (kind === "GLOBAL") {
    return k === "global" || code === "global";
  }
  return (
    k === "country" ||
    (!k && !code.startsWith("region-") && code !== "global")
  );
}

const TABS: Array<{ id: KindFilter; label: string }> = [
  { id: "ALL", label: "All Plans" },
  { id: "COUNTRY", label: "Country" },
  { id: "REGIONAL", label: "Regional" },
  { id: "GLOBAL", label: "Global" },
];

export default function PartnerCatalogClient({
  offers,
  loadError,
}: {
  offers: PartnerApiOfferRow[];
  loadError?: string | null;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return offers.filter((o) => {
      if (!matchesKind(o, kind)) return false;
      if (!needle) return true;
      const hay =
        `${o.name} ${o.destinationLabel} ${o.destinationCode} ${o.dataLabel} ${o.offerId}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [offers, q, kind]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Catalog
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Wholesale USD pricing after your partner discount. Search and filter
            instantly.
          </p>
        </div>
        <a
          href="/api/partner/catalog/csv"
          className={`${partnerPrimaryCtaClass} gap-2`}
        >
          <Download className="h-4 w-4" aria-hidden />
          Download All Plans CSV
        </a>
      </header>

      {loadError ? (
        <div
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      <div className={partnerCardClass + " space-y-4 !p-4 sm:!p-5"}>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search plans, destinations, offer ID…"
            className={`${partnerFieldClass} !mt-0 pl-10`}
            aria-label="Search catalog"
          />
        </div>

        <div
          className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Plan type"
        >
          {TABS.map((tab) => {
            const active = kind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKind(tab.id)}
                className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition ${
                  active
                    ? "bg-emerald-500 text-slate-950"
                    : "border border-white/[0.08] text-slate-300 hover:bg-white/[0.04]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">
          Showing{" "}
          <span className="font-semibold tabular-nums text-slate-300">
            {filtered.length}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums text-slate-300">
            {offers.length}
          </span>{" "}
          plans
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.1] px-5 py-12 text-center text-sm text-slate-400">
          {offers.length === 0
            ? "No catalog plans are available right now. Try again shortly."
            : "No plans match these filters."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D1526]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Destination</th>
                  <th className="px-4 py-3 font-semibold">Data</th>
                  <th className="px-4 py-3 font-semibold">Validity</th>
                  <th className="px-4 py-3 font-semibold">Wholesale</th>
                  <th className="px-4 py-3 font-semibold">Retail</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((offer) => (
                  <tr
                    key={`${offer.offerId}-${offer.destinationCode}`}
                    className="border-t border-white/[0.05] transition hover:bg-white/[0.02]"
                  >
                    <td className="max-w-[14rem] truncate px-4 py-3.5 font-medium text-slate-100">
                      {offer.name}
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">
                      {offer.destinationLabel}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-300">
                      {offer.dataLabel}
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">
                      {offer.validityLabel}
                    </td>
                    <td className="px-4 py-3.5 font-semibold tabular-nums text-emerald-300">
                      {offer.partnerPriceLabel}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-500 line-through decoration-slate-600">
                      {offer.retailPriceLabel ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/partner/buy?offerId=${encodeURIComponent(offer.offerId)}&country=${encodeURIComponent(offer.destinationCode)}`}
                        className="inline-flex h-8 items-center rounded-lg bg-emerald-500 px-3 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
                      >
                        Buy
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
