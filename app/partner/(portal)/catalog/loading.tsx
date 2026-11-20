/** Fast destination/catalog skeleton — page settles without hanging. */
export default function PartnerCatalogLoading() {
  return (
    <div
      className="animate-pulse space-y-6"
      aria-busy="true"
      aria-label="Loading catalog"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-36 rounded-lg bg-white/[0.06]" />
          <div className="h-4 w-72 max-w-full rounded bg-white/[0.04]" />
        </div>
        <div className="h-11 w-52 rounded-xl bg-emerald-500/20" />
      </div>
      <div className="h-20 rounded-2xl border border-white/[0.06] bg-[#0D1526]" />
      <div className="h-11 rounded-xl bg-white/[0.04]" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[72px] rounded-2xl border border-white/[0.06] bg-[#0D1526]"
          />
        ))}
      </div>
    </div>
  );
}
