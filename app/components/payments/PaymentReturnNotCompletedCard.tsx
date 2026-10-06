/**
 * Shared "payment not completed" card with optional WhatsApp recovery CTA.
 * Display-only — never funds purchases or trusts browser payment params.
 */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  PAYMENT_RETURN_WHATSAPP_CTA_LABEL,
  PAYMENT_RETURN_WHATSAPP_HELP_HINT,
} from "@/app/lib/support/whatsappSupportShared";

type Props = {
  primaryHref: string;
  primaryLabel: string;
  tertiaryHref: string;
  tertiaryLabel: string;
  /** Prebuilt wa.me href when WhatsApp support is enabled; omit when off. */
  whatsappHref?: string | null;
};

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

export function PaymentReturnNotCompletedCard({
  primaryHref,
  primaryLabel,
  tertiaryHref,
  tertiaryLabel,
  whatsappHref = null,
}: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-xl font-bold tracking-tight text-[var(--heading)] sm:text-2xl">
          Payment not completed
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--text-muted)] sm:text-[15px]">
          Your payment was not completed. No eSIM was created from this return.
        </p>

        <div className="mt-7 flex w-full max-w-sm flex-col items-center gap-3">
          <PrimaryLink href={primaryHref}>{primaryLabel}</PrimaryLink>

          {whatsappHref ? (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                {PAYMENT_RETURN_WHATSAPP_HELP_HINT}
              </p>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                data-payment-return-whatsapp-cta="true"
                aria-label="Chat on WhatsApp for help"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#25D366] px-5 text-sm font-semibold text-white transition hover:bg-[#1ebe57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/60"
              >
                <WhatsAppGlyph className="h-5 w-5 shrink-0" />
                {PAYMENT_RETURN_WHATSAPP_CTA_LABEL}
              </a>
            </>
          ) : null}

          <QuietLink href={tertiaryHref}>{tertiaryLabel}</QuietLink>
        </div>
      </div>
    </div>
  );
}

function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
    >
      {children}
    </Link>
  );
}

function QuietLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--heading)] hover:underline"
    >
      {children}
    </Link>
  );
}
