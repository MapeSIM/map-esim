import Link from "next/link";
import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { requireRole } from "@/app/lib/auth/session";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";
import { resolveHostedCheckoutProvider } from "@/app/lib/payments/gatewaySelect";
import { getSimpaisaWalletOperatorConfig } from "@/app/lib/payments/simpaisaWalletOperatorConfig";
import PartnerWalletAddFundsForm from "@/app/components/partner/PartnerWalletAddFundsForm";
import {
  partnerCardClass,
  partnerPrimaryCtaClass,
} from "@/app/components/partner/partnerPortalUi";

export const dynamic = "force-dynamic";

const PORTAL_UNAVAILABLE =
  "Wallet data is temporarily unavailable. Please refresh shortly.";

export default async function PartnerWalletPage() {
  const user = await requireRole("PARTNER");

  let summary: Awaited<ReturnType<typeof getPartnerPortalSummary>>;
  try {
    summary = await getPartnerPortalSummary(user.id);
  } catch {
    return (
      <div className={partnerCardClass} role="status">
        <p className="text-sm font-medium text-slate-100">{PORTAL_UNAVAILABLE}</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={partnerCardClass} role="status">
        <p className="text-sm font-medium text-slate-100">
          Partner access is unavailable.
        </p>
      </div>
    );
  }

  const selectedProvider = resolveHostedCheckoutProvider(
    process.env.PAYMENT_GATEWAY_PROVIDER
  );
  const gatewayReady =
    selectedProvider === "SIMPAISA" && isPaymentGatewayConfigured();
  const simpaisaOperators = await getSimpaisaWalletOperatorConfig();

  return (
    <div className="min-w-0 w-full max-w-full space-y-8">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Wallet
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Prepaid USD balance for wholesale eSIM purchases.
          </p>
        </div>
        <Link href="/partner/catalog" className={partnerPrimaryCtaClass}>
          Buy eSIM
        </Link>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 via-[#0D1526] to-[#0D1526] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
          Available balance
        </p>
        <p className="mt-2 text-4xl font-bold tracking-tight text-slate-50 tabular-nums">
          {summary.balanceLabel}
        </p>
        <p className="mt-1 text-sm text-slate-400">USD</p>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
          Partner discount{" "}
          <span className="font-semibold text-slate-200">
            {summary.discountPercentLabel}
          </span>{" "}
          applies automatically at purchase. Admin credits also land here.
        </p>
      </div>

      <PartnerWalletAddFundsForm
        balanceLabel={summary.balanceLabel}
        gatewayReady={gatewayReady}
        enabledSimpaisaOperatorIds={simpaisaOperators.enabledOperatorIds}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-50">
          Transaction history
        </h2>
        {summary.recentTransactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#0D1526] p-6 text-sm text-slate-400">
            No wallet transactions yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D1526]">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Balance after</th>
                  <th className="px-4 py-3 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentTransactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-t border-white/[0.05] hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-100">{tx.typeLabel}</p>
                      <p className="text-xs text-slate-500">{tx.reason}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-100">
                      {tx.amountLabel}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-400">
                      {tx.balanceAfterLabel}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {tx.createdAtLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
