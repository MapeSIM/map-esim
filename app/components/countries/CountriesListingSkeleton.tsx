function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[color-mix(in_srgb,#0F172A_72%,#1e293b)] ${className}`}
      aria-hidden="true"
    />
  );
}

export default function CountriesListingSkeleton() {
  return (
    <main
      className="min-h-screen bg-[#0A1128] text-[var(--heading)]"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <section className="border-b border-[var(--border)] px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-[1200px] space-y-3 text-center">
          <Shimmer className="mx-auto h-3 w-40 bg-[color-mix(in_srgb,#00E676_22%,#0F172A)]" />
          <Shimmer className="mx-auto h-9 w-[min(100%,28rem)]" />
          <Shimmer className="mx-auto h-11 w-full max-w-xl rounded-xl" />
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Shimmer key={index} className="h-10 w-24 rounded-full" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <Shimmer
              key={index}
              className="h-[84px] w-full rounded-2xl bg-[#0F172A]/80"
            />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading destinations…</span>
    </main>
  );
}
