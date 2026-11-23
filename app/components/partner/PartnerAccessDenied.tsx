import Link from "next/link";
import { RETAIL_SITE_ORIGIN } from "@/app/lib/domain/appDomain";
import PartnerAccessDeniedSignOut from "@/app/components/partner/PartnerAccessDeniedSignOut";

export default function PartnerAccessDenied({
  retailHref = RETAIL_SITE_ORIGIN,
  applyHref = "/contact?topic=partner",
}: {
  retailHref?: string;
  applyHref?: string;
}) {
  return (
    <div className="min-h-screen w-full bg-[#070D19] text-slate-100">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-slate-950">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-50">
              MAP eSIM{" "}
              <span className="font-medium text-slate-400">Partner</span>
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-col px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0D1526] p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-50">
            Partner access required
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            This portal is for approved Partner accounts only. Retail customers
            should shop on mapesim.com. To get wholesale API access, apply for a
            Partner account.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <a
              href={retailHref}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              Go to mapesim.com
            </a>
            <Link
              href={applyHref}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.05]"
            >
              Apply for Partner Account
            </Link>
          </div>
          <div className="mt-4">
            <PartnerAccessDeniedSignOut />
          </div>
        </div>
      </main>
    </div>
  );
}
