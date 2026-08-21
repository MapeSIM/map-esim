import Link from "next/link";
import type { ReactNode } from "react";
import {
  CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
  CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
} from "@/app/lib/esim/customerPurchaseStatusMessaging";
import type { EsimPaymentReturnKind } from "@/app/lib/esim/esimPurchasePaymentReturnState";
import { esimPurchasePaymentReviewHref } from "@/app/lib/esim/esimPurchasePaymentReturnState";

/** Display-only. Never funds, never creates orders, never trusts browser payment params. */
export function EsimPurchasePaymentReturnView({
  kind,
  purchaseId,
  refreshHref,
}: {
  kind: Exclude<EsimPaymentReturnKind, "completed">;
  purchaseId: string;
  refreshHref: string;
}) {
  const reviewHref = esimPurchasePaymentReviewHref(purchaseId);

  if (kind === "verified") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">Payment verified</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {CUSTOMER_PURCHASE_PROCESSING_MESSAGE}
        </p>
        <StatusCard>
          Refresh this page in a moment. When the eSIM is ready you will be
          taken to your purchase confirmation.
        </StatusCard>
        <ActionRow>
          <PrimaryLink href={refreshHref}>Refresh status</PrimaryLink>
          <SecondaryLink href="/account/orders">My eSIMs</SecondaryLink>
          <SecondaryLink href="/account">Account</SecondaryLink>
        </ActionRow>
      </ReturnShell>
    );
  }

  if (kind === "not_completed") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">
          Payment not completed
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your payment was not completed. No eSIM was created from this return.
        </p>
        <StatusCard>
          You can return to checkout and try again when you are ready. This
          page does not charge your wallet or card.
        </StatusCard>
        <ActionRow>
          <PrimaryLink href={reviewHref}>Back to checkout</PrimaryLink>
          <SecondaryLink href="/account/esim/buy">
            Choose another package
          </SecondaryLink>
          <SecondaryLink href="/account">Account</SecondaryLink>
        </ActionRow>
      </ReturnShell>
    );
  }

  if (kind === "under_review") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">
          Purchase under review
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE}
        </p>
        <StatusCard>
          Refresh this page for an update, or contact support with your order
          details if the status does not change.
        </StatusCard>
        <ActionRow>
          <PrimaryLink href={refreshHref}>Refresh status</PrimaryLink>
          <SecondaryLink href="/account">Account</SecondaryLink>
        </ActionRow>
      </ReturnShell>
    );
  }

  return (
    <ReturnShell>
      <h1 className="text-2xl font-bold tracking-tight">Payment processing</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        We received your return from the payment page. Your payment is being
        verified. This page does not confirm payment or activate an eSIM.
      </p>
      <StatusCard>
        You will be able to access your eSIM only after payment is verified.
        No wallet funds were charged from this return page. Refresh this page
        in a moment, or return to checkout if you still need to pay.
      </StatusCard>
      <ActionRow>
        <PrimaryLink href={refreshHref}>Refresh status</PrimaryLink>
        <SecondaryLink href={reviewHref}>Back to checkout</SecondaryLink>
        <SecondaryLink href="/account">Account</SecondaryLink>
      </ActionRow>
    </ReturnShell>
  );
}

function ReturnShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-xl space-y-8">{children}</div>;
}

function StatusCard({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
      role="status"
    >
      <p className="text-sm text-[var(--heading)]">{children}</p>
    </div>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div>;
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

function SecondaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:bg-[var(--surface-2)]"
    >
      {children}
    </Link>
  );
}
