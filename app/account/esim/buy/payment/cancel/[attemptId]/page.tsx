import { notFound } from "next/navigation";
import { EsimPurchasePaymentCancelView } from "@/app/account/esim/buy/payment/cancel/EsimPurchasePaymentCancelView";
import { requireRole } from "@/app/lib/auth/session";
import { getOwnedEsimPurchasePaymentAttempt } from "@/app/lib/esim/esimPurchaseGatewayCheckout";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";
import { parsePaymentAttemptId } from "@/app/lib/payments/safepayCheckoutPaths";

export const dynamic = "force-dynamic";

/**
 * Preferred cancel route: path-based attempt id (no query on redirect_url).
 */
export default async function EsimPurchasePaymentCancelAttemptPage({
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

  await maybeReleasePendingGatewayReservation({
    customerUserId: user.id,
    purchaseId: attempt.purchaseId,
    attemptId: attempt.attemptId,
  }).catch(() => undefined);

  return <EsimPurchasePaymentCancelView purchaseId={attempt.purchaseId} />;
}
