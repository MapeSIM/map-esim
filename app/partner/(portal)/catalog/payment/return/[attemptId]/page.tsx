import { redirect } from "next/navigation";
import { EsimPurchasePaymentAttemptStatus } from "@prisma/client";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { getOwnedPartnerEsimPurchasePaymentAttempt } from "@/app/lib/partner/partnerEsimPurchaseGatewayCheckout";
import { maybeReleasePendingPartnerGatewayReservation } from "@/app/lib/partner/partnerEsimPurchasePaymentApply";
import { browserReturnMustNotFundPartnerEsimPurchase } from "@/app/lib/partner/partnerEsimPurchasePaymentConstants";
import {
  partnerEsimPurchasePaymentOrdersHref,
  resolvePartnerPaymentReturnKind,
} from "@/app/lib/partner/partnerEsimPurchasePaymentReturnState";
import { partnerEsimPurchasePaymentReturnPath } from "@/app/lib/partner/partnerEsimPurchaseCheckoutPaths";
import { parsePaymentAttemptId } from "@/app/lib/payments/safepayCheckoutPaths";
import { resolvePaymentReturnWalletOperatorLabel } from "@/app/lib/payments/paymentReturnUxCopy";
import { getSimpaisaWalletOperatorConfig } from "@/app/lib/payments/simpaisaWalletOperatorConfig";
import { getPublicWhatsAppSupportConfig } from "@/app/lib/support/whatsappSupport";
import { buildPaymentReturnWhatsAppRecoveryHref } from "@/app/lib/support/whatsappSupportShared";
import { PartnerEsimPurchasePaymentReturnView } from "@/app/partner/(portal)/catalog/payment/return/PartnerEsimPurchasePaymentReturnView";

export const dynamic = "force-dynamic";

const OPEN_ATTEMPT_STATUSES = new Set<string>([
  EsimPurchasePaymentAttemptStatus.DRAFT,
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
]);

/**
 * Partner eSIM payment return — durable DB statuses only for UX.
 * Never marks paid / never funds from browser return / never calls VeSIM.
 * Releases still-pending wallet holds when checkout is cancelled/failed/expired
 * (customer return parity) so holds do not wait on the daily stale cron.
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

  let kind = resolvePartnerPaymentReturnKind({
    purchaseStatus: attempt.purchaseStatus,
    attemptStatus: attempt.status,
  });

  if (kind === "completed") {
    redirect(partnerEsimPurchasePaymentOrdersHref());
  }

  const attemptExpired =
    attempt.expiresAt instanceof Date &&
    Number.isFinite(attempt.expiresAt.getTime()) &&
    attempt.expiresAt.getTime() <= Date.now();
  const shouldReleaseHold =
    kind === "not_completed" ||
    (kind === "pending" &&
      attemptExpired &&
      OPEN_ATTEMPT_STATUSES.has(attempt.status));

  if (shouldReleaseHold) {
    const attemptStillOpen = OPEN_ATTEMPT_STATUSES.has(attempt.status);
    const terminal = attemptStillOpen
      ? attemptExpired
        ? "EXPIRED"
        : "CANCELLED"
      : undefined;
    await maybeReleasePendingPartnerGatewayReservation({
      partnerUserId: user.id,
      purchaseId: attempt.purchaseId,
      attemptId: attempt.attemptId,
      ...(terminal ? { attemptTerminalStatus: terminal } : {}),
    }).catch(() => undefined);

    // Re-read so UX reflects restored READY after release.
    const refreshed = await getOwnedPartnerEsimPurchasePaymentAttempt(
      user.id,
      attemptId
    );
    if (refreshed) {
      kind = resolvePartnerPaymentReturnKind({
        purchaseStatus: refreshed.purchaseStatus,
        attemptStatus: refreshed.status,
      });
      if (kind === "completed") {
        redirect(partnerEsimPurchasePaymentOrdersHref());
      }
    }
  }

  const refreshHref = partnerEsimPurchasePaymentReturnPath(attempt.attemptId);
  const [operators, whatsappConfig] = await Promise.all([
    getSimpaisaWalletOperatorConfig(),
    getPublicWhatsAppSupportConfig(),
  ]);
  const walletOperatorLabel = resolvePaymentReturnWalletOperatorLabel({
    enabledOperatorIds: operators.enabledOperatorIds,
  });
  const walletOperatorId =
    operators.enabledOperatorIds.length === 1
      ? operators.enabledOperatorIds[0]!
      : null;
  const whatsappHref =
    kind === "not_completed"
      ? buildPaymentReturnWhatsAppRecoveryHref(whatsappConfig)
      : null;

  return (
    <PartnerEsimPurchasePaymentReturnView
      kind={kind}
      attemptId={attempt.attemptId}
      refreshHref={refreshHref}
      walletOperatorLabel={walletOperatorLabel}
      walletOperatorId={walletOperatorId}
      whatsappHref={whatsappHref}
    />
  );
}
