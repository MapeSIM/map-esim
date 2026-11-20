/** Lightweight catalog skeleton — never blocks forever; page always settles. */
export default function PartnerCatalogLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading catalog">
      <div className="flex justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-lg bg-white/[0.06]" />
          <div className="h-4 w-72 max-w-full rounded bg-white/[0.04]" />
        </div>
        <div className="h-11 w-48 rounded-xl bg-emerald-500/20" />
      </div>
      <div className="h-28 rounded-2xl border border-white/[0.06] bg-[#0D1526]" />
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D1526]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-t border-white/[0.04] px-4 py-4 first:border-t-0"
          >
            <div className="h-4 flex-1 rounded bg-white/[0.05]" />
            <div className="h-4 w-24 rounded bg-white/[0.04]" />
            <div className="h-4 w-16 rounded bg-white/[0.04]" />
            <div className="h-4 w-20 rounded bg-emerald-500/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
