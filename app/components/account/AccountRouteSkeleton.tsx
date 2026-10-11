type Variant =
  | "overview"
  | "orders"
  | "wallet"
  | "rewards"
  | "profile"
  | "security";

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-[var(--surface-2)] ${className}`} />;
}

export default function AccountRouteSkeleton({
  variant,
  title,
}: {
  variant: Variant;
  title: string;
}) {
  return (
    <div className="min-w-0 space-y-6" role="status" aria-busy="true" aria-live="polite">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <Pulse className="mt-3 h-4 w-64 max-w-full" />
      </div>

      {variant === "overview" ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Pulse key={index} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : null}

      {variant === "orders" ? (
        <>
          <Pulse className="h-28 w-full rounded-[24px]" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Pulse key={index} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        </>
      ) : null}

      {variant === "wallet" ? (
        <>
          <Pulse className="h-24 w-full rounded-2xl" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Pulse key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </>
      ) : null}

      {variant === "rewards" ? (
        <Pulse className="h-40 w-full rounded-2xl" />
      ) : null}

      {variant === "profile" ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5">
          <Pulse className="h-4 w-40" />
          <Pulse className="h-4 w-56" />
          <Pulse className="h-7 w-32 rounded-full" />
        </div>
      ) : null}

      {variant === "security" ? (
        <div className="space-y-4">
          <Pulse className="h-5 w-40" />
          <Pulse className="h-11 w-full rounded-xl" />
          <Pulse className="h-11 w-full rounded-xl" />
          <Pulse className="h-11 w-full rounded-xl" />
          <Pulse className="h-11 w-40 rounded-[14px]" />
        </div>
      ) : null}

      <span className="sr-only">Loading {title}…</span>
    </div>
  );
}
