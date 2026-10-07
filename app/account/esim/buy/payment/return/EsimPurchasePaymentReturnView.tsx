/**
 * Customer eSIM payment return — display only.
 * Never funds, never creates orders, never trusts browser payment params.
 */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
  CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
  CUSTOMER_PURCHASE_REVIEW_NEEDED_TITLE,
} from "@/app/lib/esim/customerPurchaseStatusMessaging";
import type { EsimPaymentReturnKind } from "@/app/lib/esim/esimPurchasePaymentReturnState";
import { esimPurchasePaymentReviewHref } from "@/app/lib/esim/esimPurchasePaymentReturnState";
import {
  PAYMENT_RETURN_CHECK_STATUS_LABEL,
  PAYMENT_RETURN_PREPARING_HEADLINE,
  PAYMENT_RETURN_VERIFYING_HEADLINE,
  paymentReturnPendingGuidance,
} from "@/app/lib/payments/paymentReturnUxCopy";
import { PaymentAuthorizePendingPanel } from "@/app/components/payments/PaymentAuthorizePendingPanel";
import { PaymentReturnNotCompletedCard } from "@/app/components/payments/PaymentReturnNotCompletedCard";

export function EsimPurchasePaymentReturnView({
  kind,
  purchaseId,
  refreshHref,
  walletOperatorLabel = null,
  walletOperatorId = null,
  whatsappHref = null,
}: {
  kind: Exclude<EsimPaymentReturnKind, "completed">;
  purchaseId: string;
  refreshHref: string;
  /** Display-only JazzCash / Easypaisa label when known. */
  walletOperatorLabel?: string | null;
  /** Operator id when known (100007 / 100008) — drives authorize countdown. */
  walletOperatorId?: string | null;
  /** Prefill wa.me recovery link when WhatsApp support is enabled. */
  whatsappHref?: string | null;
}) {
  const reviewHref = esimPurchasePaymentReviewHref(purchaseId);

  if (kind === "verified") {
    return (
      <ReturnShell>
        <PaymentAuthorizePendingPanel
          headline={PAYMENT_RETURN_PREPARING_HEADLINE}
          guidance={CUSTOMER_PURCHASE_PROCESSING_MESSAGE}
          refreshHref={refreshHref}
          secondaryHref="/account"
          secondaryLabel="Return to account"
          tryAgainHref={reviewHref}
          showAuthorizeCountdown={false}
        />
      </ReturnShell>
    );
  }

  if (kind === "not_completed") {
    return (
      <ReturnShell>
        <PaymentReturnNotCompletedCard
          primaryHref={reviewHref}
          primaryLabel="Back to checkout"
          tertiaryHref="/account"
          tertiaryLabel="Return to account"
          whatsappHref={whatsappHref}
        />
      </ReturnShell>
    );
  }

  if (kind === "under_review") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">
          {CUSTOMER_PURCHASE_REVIEW_NEEDED_TITLE}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE}
        </p>
        <ActionRow>
          <SecondaryButtonLink href={refreshHref}>
            {PAYMENT_RETURN_CHECK_STATUS_LABEL}
          </SecondaryButtonLink>
          <QuietLink href="/contact">Contact support</QuietLink>
          <QuietLink href="/account">Return to account</QuietLink>
        </ActionRow>
      </ReturnShell>
    );
  }

  return (
    <ReturnShell>
      <PaymentAuthorizePendingPanel
        headline={PAYMENT_RETURN_VERIFYING_HEADLINE}
        guidance={paymentReturnPendingGuidance(walletOperatorLabel)}
        refreshHref={refreshHref}
        secondaryHref="/account"
        secondaryLabel="Return to account"
        tryAgainHref={reviewHref}
        walletOperatorLabel={walletOperatorLabel}
        walletOperatorId={walletOperatorId}
        showAuthorizeCountdown
      />
    </ReturnShell>
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
