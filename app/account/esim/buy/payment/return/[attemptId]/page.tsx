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
 * Preferred return route: path-based attempt id so Safepay can append
 * `?tracker=` without mangling query params.
 * Display follows durable DB statuses only. Query tracker/status are ignored.
 * Does not mark paid, debit wallet, or create VeSIM orders.
 */
export default async function EsimPurchasePaymentReturnAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ tracker?: string; status?: string; purchase?: string }>;
}) {
  const user = await requireRole("CUSTOMER");
  const { attemptId: rawAttemptId } = await params;
  const query = await searchParams;

  void query.tracker;
  void query.status;
  void query.purchase;

  const attemptId = parsePaymentAttemptId(rawAttemptId);
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
  const whatsappHref =
    kind === "not_completed"
      ? buildPaymentReturnWhatsAppRecoveryHref(whatsappConfig)
      : null;

  return (
    <EsimPurchasePaymentReturnView
      kind={kind}
      purchaseId={attempt.purchaseId}
      refreshHref={`/account/esim/buy/payment/return/${encodeURIComponent(attempt.attemptId)}`}
      walletOperatorLabel={walletOperatorLabel}
      whatsappHref={whatsappHref}
    />
  );
}
