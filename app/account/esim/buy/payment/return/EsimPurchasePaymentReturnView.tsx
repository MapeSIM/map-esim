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
  cancelHref = null,
  paymentProvider = null,
}: {
  kind: Exclude<EsimPaymentReturnKind, "completed">;
  purchaseId: string;
  refreshHref: string;
  /** Authenticated cancel URL — releases a still-pending wallet reservation. */
  cancelHref?: string | null;
  /** Display-only provider for copy. Never used to mark paid. */
  paymentProvider?: "SIMPAISA" | "SAFEPAY" | null;
}) {
  const reviewHref = esimPurchasePaymentReviewHref(purchaseId);
  const isSimpaisa = paymentProvider === "SIMPAISA";

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
        {isSimpaisa ? <SimpaisaWaitingChecklist /> : null}
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
          {isSimpaisa
            ? "You can return to checkout and try again when you are ready. This page does not charge your wallet or complete mobile payment. Any reserved wallet amount is restored when cancel completes."
            : "You can return to checkout and try again when you are ready. This page does not charge your wallet or complete online payment. Any reserved wallet amount is restored when cancel completes."}
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
        {isSimpaisa
          ? "We received your return from mobile payment. Your payment is being verified. This page does not confirm payment or activate an eSIM."
          : "We received your return from the payment page. Your payment is being verified. This page does not confirm payment or activate an eSIM."}
      </p>
      <StatusCard>
        You will be able to access your eSIM only after payment is verified. No
        wallet funds were charged from this return page. Use Refresh status
        below after you finish approving the payment.
        {isSimpaisa
          ? " If you abandon mobile payment, cancel below to unlock any reserved wallet funds."
          : " If you abandon payment, cancel below to unlock any reserved wallet funds."}
      </StatusCard>
      {isSimpaisa ? <SimpaisaWaitingChecklist /> : null}
      <ActionRow>
        <PrimaryLink href={refreshHref}>Refresh status</PrimaryLink>
        <SecondaryLink href={reviewHref}>Back to checkout</SecondaryLink>
        {cancelHref ? (
          <SecondaryLink href={cancelHref}>
            Cancel payment & unlock wallet
          </SecondaryLink>
        ) : null}
        <SecondaryLink href="/account">Account</SecondaryLink>
      </ActionRow>
    </ReturnShell>
  );
}

function SimpaisaWaitingChecklist() {
  return (
    <div
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
      role="note"
    >
      <p className="text-sm font-semibold text-[var(--heading)]">
        Waiting for JazzCash / Easypaisa
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--text-muted)]">
        <li>Open JazzCash or Easypaisa and approve the payment request.</li>
        <li>Return to this page and stay signed in.</li>
        <li>Tap Refresh status until your eSIM is ready.</li>
      </ol>
    </div>
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
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div>
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
