import { notFound, redirect } from "next/navigation";
import { EsimPurchasePaymentReturnView } from "@/app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView";
import { requireRole } from "@/app/lib/auth/session";
import { getOwnedEsimPurchasePaymentAttempt } from "@/app/lib/esim/esimPurchaseGatewayCheckout";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";
import {
  esimPurchasePaymentSuccessHref,
  resolveEsimPaymentReturnKind,
} from "@/app/lib/esim/esimPurchasePaymentReturnState";
import { parsePaymentAttemptId } from "@/app/lib/payments/safepayCheckoutPaths";
import { resolvePaymentReturnWalletOperatorLabel } from "@/app/lib/payments/paymentReturnUxCopy";
import { getSimpaisaWalletOperatorConfig } from "@/app/lib/payments/simpaisaWalletOperatorConfig";
import { getPublicWhatsAppSupportConfig } from "@/app/lib/support/whatsappSupport";
import { buildPaymentReturnWhatsAppRecoveryHref } from "@/app/lib/support/whatsappSupportShared";

export const dynamic = "force-dynamic";

/**
 * Informational return page after Safepay Hosted Checkout (query form).
 * Supports legacy/mangled `?attempt=id?tracker=...` from Safepay appending
 * `?tracker=` onto a redirect_url that already had a query string.
 * Display follows durable DB statuses only. Does not mark paid, debit wallet,
 * create VeSIM orders, or trust tracker/status query params.
 */
export default async function EsimPurchasePaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{
    attempt?: string;
    tracker?: string;
    status?: string;
    purchase?: string;
  }>;
}) {
  const user = await requireRole("CUSTOMER");
  const query = await searchParams;

  // Browser/query payment signals are never authoritative.
  void query.tracker;
  void query.status;
  void query.purchase;

  const attemptId = parsePaymentAttemptId(query.attempt);
  if (!attemptId) notFound();

  const attempt = await getOwnedEsimPurchasePaymentAttempt(user.id, attemptId);
  if (!attempt) notFound();

  const kind = resolveEsimPaymentReturnKind({
    purchaseStatus: attempt.purchaseStatus,
    attemptStatus: attempt.status,
  });
  if (kind === "completed") {
    redirect(esimPurchasePaymentSuccessHref(attempt.purchaseId));
  }

  // Heal path: terminal unpaid return may still hold a pre-funding reservation
  // when a failure webhook never arrived (common for abandoned Simpaisa flows).
  // Idempotent CAS release — never touches funded/confirmed purchases.
  if (kind === "not_completed") {
    await maybeReleasePendingGatewayReservation({
      customerUserId: user.id,
      purchaseId: attempt.purchaseId,
      attemptId: attempt.attemptId,
    }).catch(() => undefined);
  }

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
    <EsimPurchasePaymentReturnView
      kind={kind}
      purchaseId={attempt.purchaseId}
      refreshHref={`/account/esim/buy/payment/return?attempt=${encodeURIComponent(attempt.attemptId)}`}
      walletOperatorLabel={walletOperatorLabel}
      walletOperatorId={walletOperatorId}
      whatsappHref={whatsappHref}
    />
  );
}
