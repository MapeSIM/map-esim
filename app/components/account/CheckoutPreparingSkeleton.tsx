import { Loader2 } from "lucide-react";

/**
 * Instant structural feedback while `/account/esim/buy` prepares a purchase
 * session and redirects to review (Plan summary + Order summary cards).
 */
export default function CheckoutPreparingSkeleton({
  message = "Securing checkout & preparing eSIM plan...",
}: {
  message?: string;
}) {
  return (
    <div
      className="mx-auto max-w-5xl space-y-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
        <Loader2
          className="h-8 w-8 animate-spin text-[#00E676]"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-[#0066FF] sm:text-[15px]">
          {message}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-5">
          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6">
            <div className="h-3 w-28 animate-pulse rounded bg-[color-mix(in_srgb,#0066FF_22%,var(--surface-2))]" />
            <div className="mt-5 space-y-4">
              <div className="h-4 w-[66%] max-w-[16rem] animate-pulse rounded bg-[var(--surface-2)]" />
              <div className="h-4 w-[75%] max-w-[20rem] animate-pulse rounded bg-[var(--surface-2)]" />
              <div className="h-4 w-[50%] max-w-[12rem] animate-pulse rounded bg-[var(--surface-2)]" />
              <div className="h-4 w-[40%] max-w-[10rem] animate-pulse rounded bg-[var(--surface-2)]" />
            </div>
          </section>
          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6">
            <div className="h-3 w-24 animate-pulse rounded bg-[color-mix(in_srgb,#00E676_25%,var(--surface-2))]" />
            <div className="mt-5 space-y-3">
              <div className="h-10 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 sm:px-6">
            <div className="h-3 w-32 animate-pulse rounded bg-[color-mix(in_srgb,#0066FF_22%,var(--surface-2))]" />
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="h-4 w-20 animate-pulse rounded bg-[var(--surface-2)]" />
                <div className="h-4 w-16 animate-pulse rounded bg-[var(--surface-2)]" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-2)]" />
                <div className="h-4 w-14 animate-pulse rounded bg-[var(--surface-2)]" />
              </div>
              <div className="mt-2 h-11 w-full animate-pulse rounded-2xl bg-[color-mix(in_srgb,#00E676_18%,var(--surface-2))]" />
            </div>
          </section>
        </aside>
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );
}
