import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import { requireSession } from "@/app/lib/auth/session";
import { BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import { prisma } from "@/app/lib/db";

export default async function AccountProfilePage() {
  const user = await requireSession();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerifiedAt: true },
  });
  const emailVerified = Boolean(dbUser?.emailVerifiedAt);
  const verifyHref = user.email
    ? `/verify-email?email=${encodeURIComponent(user.email)}`
    : "/verify-email";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your signed-in account details. Name and email can&apos;t be edited
          here yet.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-sm sm:px-5">
        <p>
          <span className="text-[var(--text-soft)]">Name:</span>{" "}
          <b className="text-[var(--heading)]">{user.name}</b>
        </p>
        <p>
          <span className="text-[var(--text-soft)]">Email:</span>{" "}
          <b className="text-[var(--heading)]">{user.email}</b>
        </p>
        <div className="pt-1">
          {emailVerified ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--heading)]"
              aria-label="Email verification status: Verified"
            >
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[var(--accent-ink)]"
                aria-hidden="true"
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              Email verified
            </span>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--warning-text)]"
                aria-label="Email verification status: Not verified"
              >
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                Email not verified
              </span>
              <Link
                href={verifyHref}
                className="inline-flex h-9 items-center justify-center rounded-[14px] bg-[var(--accent-strong)] px-3 text-xs font-semibold text-[var(--accent-ink)] transition hover:opacity-95"
              >
                Verify / resend code
              </Link>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        Need to update your name or email?{" "}
        <Link
          href="/support"
          className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          Contact support
        </Link>{" "}
        at{" "}
        <a
          href={`mailto:${BRAND_SUPPORT_EMAIL}`}
          className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          {BRAND_SUPPORT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
