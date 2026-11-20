import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

/** Mini preview of how the partner white-label share QR surface looks. */
export default function PartnerBrandingPreviewCard({
  companyName,
  supportEmail,
  buttonBg,
  buttonText,
}: {
  companyName: string;
  supportEmail: string;
  buttonBg: string;
  buttonText: string;
}) {
  const bg = /^#[0-9a-fA-F]{6}$/.test(buttonBg) ? buttonBg : "#10B981";
  const fg = /^#[0-9a-fA-F]{6}$/.test(buttonText) ? buttonText : "#020617";

  return (
    <section className={partnerCardClass}>
      <h2 className="text-lg font-semibold text-slate-50">
        Share QR live preview
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        How your branded install page appears to end customers.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[#050a14]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-400/80">
            Shared eSIM
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-50">
            {companyName || "Your company"}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 px-4 py-6">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-white/[0.15] bg-white/[0.04] text-[10px] font-medium text-slate-500"
            aria-hidden
          >
            QR CODE
          </div>
          <p className="text-center text-xs text-slate-400">
            Scan to install · Support:{" "}
            <span className="text-slate-300">
              {supportEmail || "support@example.com"}
            </span>
          </p>
          <button
            type="button"
            tabIndex={-1}
            className="inline-flex h-10 w-full max-w-xs items-center justify-center rounded-xl text-sm font-bold"
            style={{ backgroundColor: bg, color: fg }}
          >
            View install guide
          </button>
        </div>
      </div>
    </section>
  );
}
