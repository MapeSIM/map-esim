"use client";

import { useState } from "react";
import { Check, Copy, Users } from "lucide-react";
import { REFERRAL_COPY } from "@/app/lib/referrals/referralConstants";

export default function ReferralShareCard({
  shareUrl,
  code,
  title,
  subtitle,
  rewardCopy,
}: {
  shareUrl: string;
  code: string;
  title: string;
  subtitle: string;
  rewardCopy: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Referrals
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--heading)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
          <p className="mt-2 text-sm font-semibold text-[var(--heading)]">
            {rewardCopy}
          </p>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
              Your code
            </p>
            <p className="font-mono text-base font-bold tracking-wide text-[var(--heading)]">
              {code}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-xs text-[var(--text-muted)] sm:text-sm">
                {shareUrl}
              </p>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[14px] bg-[var(--accent-strong)] px-3 text-xs font-semibold text-[var(--accent-ink)] transition hover:opacity-95"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {REFERRAL_COPY.copiedButton}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {REFERRAL_COPY.copyButton}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
