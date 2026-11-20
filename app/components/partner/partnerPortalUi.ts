import type { PartnerOrderStatusBadge } from "@/app/lib/partner/partnerOrdersDisplay";

/** Shared Partner Portal presentation — Stripe/Airalo-inspired B2B shell. */

export const partnerShellBg = "#070D19";
export const partnerCardBg = "#0D1526";
export const partnerBorder = "1px solid rgba(255,255,255,0.08)";
export const partnerAccent = "#10B981";

export const partnerCardClass =
  "min-w-0 rounded-2xl border border-white/[0.08] bg-[#0D1526] p-5 sm:p-6";

export const partnerInsetCardClass =
  "min-w-0 rounded-2xl border border-white/[0.08] bg-[#070D19] px-4 py-4 sm:px-5";

export const partnerSectionLabelClass =
  "text-xs font-semibold uppercase tracking-[0.12em] text-slate-500";

export const partnerSectionTitleClass =
  "text-base font-semibold tracking-tight text-slate-50";

export const partnerPrimaryCtaClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 outline-none transition hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60";

export const partnerSecondaryCtaClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-transparent px-4 text-sm font-semibold text-slate-100 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60";

export const partnerQuietCtaClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-transparent px-4 text-sm font-semibold text-slate-300 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60";

export const partnerDangerCtaClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-500/40 px-4 text-sm font-semibold text-rose-300 outline-none transition hover:bg-rose-500/10 focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-60";

export const partnerFieldClass =
  "mt-1.5 w-full min-w-0 rounded-xl border border-white/[0.1] bg-[#070D19] px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-400/50";

export function partnerStatusBadgeClass(status: PartnerOrderStatusBadge): string {
  switch (status) {
    case "Completed":
    case "Active":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
    case "Data Depleted":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "Processing":
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
    case "Under review":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "Refunded":
    case "Failed — balance returned":
    case "eSIM Expired":
      return "border-rose-500/30 bg-rose-500/10 text-rose-300";
    default:
      return "border-white/[0.08] bg-white/[0.04] text-slate-400";
  }
}
