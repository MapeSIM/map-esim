import { notFound } from "next/navigation";
import { EsimPurchasePaymentReturnView } from "@/app/account/esim/buy/payment/return/EsimPurchasePaymentReturnView";
import { requireRole } from "@/app/lib/auth/session";
import { getOwnedEsimPurchasePaymentAttempt } from "@/app/lib/esim/esimPurchaseGatewayCheckout";
import { parsePaymentAttemptId } from "@/app/lib/payments/safepayCheckoutPaths";

export const dynamic = "force-dynamic";

/**
 * Preferred return route: path-based attempt id so Safepay can append
 * `?tracker=` without mangling query params. Non-authoritative only.
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

  return <EsimPurchasePaymentReturnView purchaseId={attempt.purchaseId} />;
}
