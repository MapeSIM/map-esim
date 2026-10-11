function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[color-mix(in_srgb,#0F172A_72%,#1e293b)] ${className}`}
      aria-hidden="true"
    />
  );
}

export default function PartnerPortalSkeleton({
  title = "Partner",
  variant = "overview",
}: {
  title?: string;
  variant?: "overview" | "buy" | "catalog";
}) {
  return (
    <div
      className="min-w-0 space-y-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <Shimmer className="mt-3 h-4 w-56 max-w-full" />
      </div>

      {variant === "buy" ? (
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[#0F172A]/70 p-5">
          <Shimmer className="h-5 w-48" />
          <Shimmer className="h-4 w-40" />
          <Shimmer className="h-7 w-28" />
          <Shimmer className="h-11 w-full max-w-xs rounded-xl bg-[color-mix(in_srgb,#00E676_20%,#0F172A)]" />
        </div>
      ) : null}

      {variant === "catalog" || variant === "overview" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Shimmer className="h-24 w-full rounded-2xl" />
            <Shimmer className="h-24 w-full rounded-2xl" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Shimmer key={index} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
        </>
      ) : null}

      <span className="sr-only">Loading {title}…</span>
    </div>
  );
}
