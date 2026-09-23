import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { browserReturnMustNotFundPartnerEsimPurchase } from "@/app/lib/partner/partnerEsimPurchasePaymentConstants";
import { parsePaymentAttemptId } from "@/app/lib/payments/safepayCheckoutPaths";

export const dynamic = "force-dynamic";

/**
 * Partner eSIM payment cancel — display only.
 * Never marks paid, never credits wallet, never calls VeSIM.
 */
export default async function PartnerCatalogPaymentCancelPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  browserReturnMustNotFundPartnerEsimPurchase();
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  const { attemptId: raw } = await params;
  void parsePaymentAttemptId(raw);

  if (!actor) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8">
        <p className="text-sm font-medium text-[var(--heading)]">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Payment cancelled</h1>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-6 space-y-3">
        <p className="text-sm text-[var(--heading)]">
          Payment was cancelled. No eSIM was created. If Partner wallet funds
          were reserved, they will be restored when the checkout is cancelled or
          expires.
        </p>
        <Link
          href="/partner/catalog"
          className="inline-flex h-10 items-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)]"
        >
          Back to catalog
        </Link>
      </div>
    </div>
  );
}
