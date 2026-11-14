import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ManualPaymentPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string; ref?: string }>;
}) {
  await requireRole("CUSTOMER", "/account/esim/buy");
  const query = await searchParams;
  const reference = (query.ref ?? "").trim();

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
          Payment proof received
        </h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Thanks — your manual payment details were saved. Our team will verify
          the transfer and issue your eSIM shortly. You will receive an email
          when the eSIM is ready.
        </p>
        {reference ? (
          <p className="mt-4 text-sm font-semibold text-[var(--heading)]">
            Reference: <span className="font-mono">{reference}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/account"
            className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
          >
            Go to account
          </Link>
          <Link
            href="/account/esim/buy"
            className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)]"
          >
            Browse packages
          </Link>
        </div>
      </div>
    </div>
  );
}
