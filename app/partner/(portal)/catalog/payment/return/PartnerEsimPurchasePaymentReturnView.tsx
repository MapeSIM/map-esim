/**
 * Partner eSIM payment return — display only.
 * Never funds, never creates orders, never trusts browser payment params.
 */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { EsimPaymentReturnKind } from "@/app/lib/esim/esimPurchasePaymentReturnState";
import {
  partnerEsimPurchasePaymentCatalogHref,
  partnerEsimPurchasePaymentOrdersHref,
} from "@/app/lib/partner/partnerEsimPurchasePaymentReturnState";
import {
  PAYMENT_RETURN_CHECK_STATUS_LABEL,
  PAYMENT_RETURN_PREPARING_HEADLINE,
  PAYMENT_RETURN_VERIFYING_HEADLINE,
  paymentReturnPendingGuidance,
} from "@/app/lib/payments/paymentReturnUxCopy";
import StatusRefreshPoller from "@/app/components/payments/StatusRefreshPoller";
import { PaymentReturnNotCompletedCard } from "@/app/components/payments/PaymentReturnNotCompletedCard";

export function PartnerEsimPurchasePaymentReturnView({
  kind,
  refreshHref,
  walletOperatorLabel = null,
  whatsappHref = null,
}: {
  kind: Exclude<EsimPaymentReturnKind, "completed"> | "invalid";
  /** Kept for route ownership diagnostics; unused in clean pending UI. */
  attemptId?: string | null;
  refreshHref: string | null;
  /** Display-only JazzCash / Easypaisa label when known. */
  walletOperatorLabel?: string | null;
  /** Prefill wa.me recovery link when WhatsApp support is enabled. */
  whatsappHref?: string | null;
}) {
  const ordersHref = partnerEsimPurchasePaymentOrdersHref();
  const catalogHref = partnerEsimPurchasePaymentCatalogHref();

  if (kind === "invalid") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">
          Payment reference not found
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This payment return link is invalid or does not belong to your partner
          account. No payment was confirmed from this page.
        </p>
        <ActionRow>
          <PrimaryLink href={catalogHref}>Back to catalog</PrimaryLink>
          <QuietLink href={ordersHref}>View orders</QuietLink>
        </ActionRow>
      </ReturnShell>
    );
  }

  if (kind === "verified") {
    return (
      <ReturnShell>
        <StatusRefreshPoller enabled />
        <VerifyingCard
          headline={PAYMENT_RETURN_PREPARING_HEADLINE}
          guidance="Your payment is confirmed. We're preparing your eSIM — this page updates automatically."
          refreshHref={refreshHref}
          secondaryHref={catalogHref}
          secondaryLabel="Back to catalog"
        />
      </ReturnShell>
    );
  }

  if (kind === "not_completed") {
    return (
      <ReturnShell>
        <PaymentReturnNotCompletedCard
          primaryHref={catalogHref}
          primaryLabel="Back to catalog"
          tertiaryHref={ordersHref}
          tertiaryLabel="View orders"
          whatsappHref={whatsappHref}
        />
      </ReturnShell>
    );
  }

  if (kind === "under_review") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">
          Payment under review
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your payment needs a short review before the eSIM can be delivered. Do
          not start another purchase for the same plan.
        </p>
        <ActionRow>
          {refreshHref ? (
            <SecondaryButtonLink href={refreshHref}>
              {PAYMENT_RETURN_CHECK_STATUS_LABEL}
            </SecondaryButtonLink>
          ) : null}
          <QuietLink href={ordersHref}>View orders</QuietLink>
          <QuietLink href="/contact">Contact support</QuietLink>
        </ActionRow>
      </ReturnShell>
    );
  }

  return (
    <ReturnShell>
      <StatusRefreshPoller enabled />
      <VerifyingCard
        headline={PAYMENT_RETURN_VERIFYING_HEADLINE}
        guidance={paymentReturnPendingGuidance(walletOperatorLabel)}
        refreshHref={refreshHref}
        secondaryHref={catalogHref}
        secondaryLabel="Back to catalog"
      />
    </ReturnShell>
  );
}

function VerifyingCard({
  headline,
  guidance,
  refreshHref,
  secondaryHref,
  secondaryLabel,
}: {
  headline: string;
  guidance: string;
  refreshHref: string | null;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <div
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8 sm:px-8 sm:py-10"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center text-center">
        <span className="relative inline-flex h-14 w-14 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-[var(--accent-strong)]/15 animate-pulse"
          />
          <Loader2
            className="relative h-8 w-8 animate-spin text-[var(--accent-strong)]"
            aria-hidden="true"
          />
          <span className="sr-only">Loading</span>
        </span>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-[var(--heading)] sm:text-2xl">
          {headline}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--text-muted)] sm:text-[15px]">
          {guidance}
        </p>
        <div className="mt-7 flex w-full max-w-sm flex-col items-center gap-3">
          {refreshHref ? (
            <SecondaryButtonLink href={refreshHref}>
              {PAYMENT_RETURN_CHECK_STATUS_LABEL}
            </SecondaryButtonLink>
          ) : null}
          <QuietLink href={secondaryHref}>{secondaryLabel}</QuietLink>
        </div>
      </div>
    </div>
  );
}

function ReturnShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-xl space-y-8">{children}</div>;
}

function ActionRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
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
      className="inline-flex h-11 items-center justify-center rounded-[14px] bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
    >
      {children}
    </Link>
  );
}

function SecondaryButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface)]/80 sm:w-auto"
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
