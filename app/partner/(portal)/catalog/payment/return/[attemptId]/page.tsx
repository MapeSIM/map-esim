import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { getOwnedPartnerEsimPurchasePaymentAttempt } from "@/app/lib/partner/partnerEsimPurchaseGatewayCheckout";
import { browserReturnMustNotFundPartnerEsimPurchase } from "@/app/lib/partner/partnerEsimPurchasePaymentConstants";
import {
  partnerEsimPurchasePaymentOrdersHref,
  resolvePartnerPaymentReturnKind,
} from "@/app/lib/partner/partnerEsimPurchasePaymentReturnState";
import { partnerEsimPurchasePaymentReturnPath } from "@/app/lib/partner/partnerEsimPurchaseCheckoutPaths";
import { parsePaymentAttemptId } from "@/app/lib/payments/safepayCheckoutPaths";
import { PartnerEsimPurchasePaymentReturnView } from "@/app/partner/(portal)/catalog/payment/return/PartnerEsimPurchasePaymentReturnView";

export const dynamic = "force-dynamic";

/**
 * Partner eSIM payment return — display only from durable DB statuses.
 * Never marks paid, never credits wallet, never calls VeSIM (webhook funds).
 */
export default async function PartnerCatalogPaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ tracker?: string; status?: string }>;
}) {
  browserReturnMustNotFundPartnerEsimPurchase();
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  const { attemptId: raw } = await params;
  const query = await searchParams;
  // Browser gateway params are ignored for funding and UX status.
  void query.tracker;
  void query.status;

  if (!actor) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8">
        <p className="text-sm font-medium text-[var(--heading)]">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  const attemptId = parsePaymentAttemptId(raw);
  if (!attemptId) {
    return (
      <PartnerEsimPurchasePaymentReturnView
        kind="invalid"
        attemptId={null}
        refreshHref={null}
      />
    );
  }

  const attempt = await getOwnedPartnerEsimPurchasePaymentAttempt(
    user.id,
    attemptId
  );
  if (!attempt) {
    return (
      <PartnerEsimPurchasePaymentReturnView
        kind="invalid"
        attemptId={attemptId}
        refreshHref={null}
      />
    );
  }

  const kind = resolvePartnerPaymentReturnKind({
    purchaseStatus: attempt.purchaseStatus,
    attemptStatus: attempt.status,
  });

  if (kind === "completed") {
    redirect(partnerEsimPurchasePaymentOrdersHref());
  }

  const refreshHref = partnerEsimPurchasePaymentReturnPath(attempt.attemptId);

  return (
    <PartnerEsimPurchasePaymentReturnView
      kind={kind}
      attemptId={attempt.attemptId}
      refreshHref={refreshHref}
      paymentProvider={
        attempt.gatewayProvider === "SIMPAISA" ||
        attempt.gatewayProvider === "SAFEPAY"
          ? attempt.gatewayProvider
          : null
      }
    />
  );
}
