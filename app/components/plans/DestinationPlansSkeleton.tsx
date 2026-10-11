/**
 * Instant structural feedback while destination plan pages (country / regional /
 * global under `/countries/[id]`) resolve offers.
 */
function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[color-mix(in_srgb,#0F172A_72%,#1e293b)] ${className}`}
      aria-hidden="true"
    />
  );
}

function PackageCardSkeleton() {
  return (
    <article
      className="
        flex h-full min-w-0 flex-col rounded-[22px]
        border border-[var(--border)] bg-[#0F172A]/80 p-4
        shadow-[0_10px_28px_rgba(0,0,0,0.2)] sm:p-5 md:min-h-[220px]
      "
    >
      <div className="flex items-start justify-between gap-3">
        <Shimmer className="h-8 w-24 bg-[color-mix(in_srgb,#00E676_18%,#0F172A)]" />
        <Shimmer className="h-7 w-16 bg-[color-mix(in_srgb,#0066FF_20%,#0F172A)]" />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Shimmer className="h-4 w-[70%]" />
        <Shimmer className="h-4 w-[55%]" />
        <Shimmer className="h-4 w-[40%]" />
      </div>
      <div className="mt-auto grid grid-cols-1 gap-3 pt-5 min-[400px]:grid-cols-2">
        <Shimmer className="h-11 w-full rounded-xl bg-[color-mix(in_srgb,#00E676_22%,#0F172A)]" />
        <Shimmer className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-transparent" />
      </div>
    </article>
  );
}

export default function DestinationPlansSkeleton({
  cardCount = 6,
}: {
  cardCount?: number;
}) {
  const cards = Math.min(8, Math.max(6, cardCount));

  return (
    <main
      className="min-h-screen overflow-x-clip bg-[#0A1128] text-[var(--heading)]"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <section className="theme-hero border-b border-[var(--border)] bg-[#0A1128]">
        <div className="mx-auto max-w-[1200px] px-4 pb-3 pt-6 sm:px-6 sm:py-8">
          <Shimmer className="mb-4 h-4 w-36" />
          <div className="flex items-start gap-3 sm:gap-4">
            <Shimmer className="h-11 w-11 shrink-0 rounded-2xl sm:h-16 sm:w-16" />
            <div className="min-w-0 flex-1 space-y-2">
              <Shimmer className="h-3 w-28 bg-[color-mix(in_srgb,#00E676_25%,#0F172A)]" />
              <Shimmer className="h-8 w-[min(100%,18rem)] sm:h-10 sm:w-[22rem]" />
              <Shimmer className="h-4 w-48" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 pt-4 pb-6 sm:px-6 sm:py-10">
        <Shimmer className="mb-3 h-4 w-72 max-w-full sm:mb-6" />

        <div className="rounded-3xl border border-[var(--border-strong)] bg-[#0F172A]/90 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.22)] sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Shimmer className="h-10 w-28 rounded-full" />
            <Shimmer className="h-10 w-32 rounded-full" />
            <Shimmer className="h-10 w-24 rounded-full" />
            <Shimmer className="ml-auto h-10 w-36 rounded-full" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: cards }).map((_, index) => (
            <PackageCardSkeleton key={index} />
          ))}
        </div>
      </section>
      <span className="sr-only">Loading destination plans…</span>
    </main>
  );
}
