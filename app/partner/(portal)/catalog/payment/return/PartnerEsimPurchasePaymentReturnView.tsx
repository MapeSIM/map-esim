import Link from "next/link";
import type { ReactNode } from "react";
import type { EsimPaymentReturnKind } from "@/app/lib/esim/esimPurchasePaymentReturnState";
import {
  partnerEsimPurchasePaymentCatalogHref,
  partnerEsimPurchasePaymentOrdersHref,
} from "@/app/lib/partner/partnerEsimPurchasePaymentReturnState";
import { partnerEsimPurchasePaymentCancelPath } from "@/app/lib/partner/partnerEsimPurchaseCheckoutPaths";

/** Display-only. Never funds, never creates orders, never trusts browser payment params. */
export function PartnerEsimPurchasePaymentReturnView({
  kind,
  attemptId,
  refreshHref,
  paymentProvider = null,
}: {
  kind: Exclude<EsimPaymentReturnKind, "completed"> | "invalid";
  attemptId: string | null;
  refreshHref: string | null;
  /** Display-only provider for copy. Never used to mark paid. */
  paymentProvider?: "SIMPAISA" | "SAFEPAY" | null;
}) {
  const ordersHref = partnerEsimPurchasePaymentOrdersHref();
  const catalogHref = partnerEsimPurchasePaymentCatalogHref();
  const isSimpaisa = paymentProvider === "SIMPAISA";
  const cancelHref =
    kind === "pending" && attemptId
      ? partnerEsimPurchasePaymentCancelPath(attemptId)
      : null;

  if (kind === "invalid") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">
          Payment reference not found
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This payment return link is invalid or does not belong to your
          partner account. No payment was confirmed from this page.
        </p>
        <StatusCard>
          Return to the catalog to start a new purchase, or check orders if you
          already completed payment.
        </StatusCard>
        <ActionRow>
          <PrimaryLink href={catalogHref}>Back to catalog</PrimaryLink>
          <SecondaryLink href={ordersHref}>View orders</SecondaryLink>
        </ActionRow>
      </ReturnShell>
    );
  }

  if (kind === "verified") {
    return (
      <ReturnShell>
        <h1 className="text-2xl font-bold tracking-tight">Payment verified</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your payment is confirmed. We are preparing your eSIM. This page does
          not finalize delivery — refresh or check orders in a moment.
        </p>
        <StatusCard>
          Do not buy the same plan again. When the eSIM is ready it will appear
          in your orders.
        </StatusCard>
        {isSimpaisa ? <SimpaisaWaitingChecklist /> : null}
        <ActionRow>
          {refreshHref ? (
            <PrimaryLink href={refreshHref}>Refresh status</PrimaryLink>
          ) : null}
          <SecondaryLink href={ordersHref}>View orders</SecondaryLink>
          <SecondaryLink href={catalogHref}>Back to catalog</SecondaryLink>
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
            ? "You can return to the catalog and try again when you are ready. This page does not charge your wallet or complete mobile payment."
            : "You can return to the catalog and try again when you are ready. This page does not charge your wallet or complete online payment."}
        </StatusCard>
        <ActionRow>
          <PrimaryLink href={catalogHref}>Back to catalog</PrimaryLink>
          <SecondaryLink href={ordersHref}>View orders</SecondaryLink>
        </ActionRow>
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
        <StatusCard>
          Refresh for an update, or contact support if the status does not
          change. Reserved wallet funds stay held until review finishes.
        </StatusCard>
        <ActionRow>
          {refreshHref ? (
            <PrimaryLink href={refreshHref}>Refresh status</PrimaryLink>
          ) : null}
          <SecondaryLink href={ordersHref}>View orders</SecondaryLink>
          <SecondaryLink href="/contact">Contact support</SecondaryLink>
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
        You will be able to access your eSIM only after payment is verified via
        our payment confirmation. Use Refresh status after you finish approving
        the payment.
        {isSimpaisa
          ? " If you abandon mobile payment, cancel below to unlock any reserved wallet funds."
          : " If you abandon payment, cancel below to unlock any reserved wallet funds."}
      </StatusCard>
      {isSimpaisa ? <SimpaisaWaitingChecklist /> : null}
      <ActionRow>
        {refreshHref ? (
          <PrimaryLink href={refreshHref}>Refresh status</PrimaryLink>
        ) : null}
        <SecondaryLink href={catalogHref}>Back to catalog</SecondaryLink>
        {cancelHref ? (
          <SecondaryLink href={cancelHref}>
            Cancel payment & unlock wallet
          </SecondaryLink>
        ) : null}
        <SecondaryLink href={ordersHref}>View orders</SecondaryLink>
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
