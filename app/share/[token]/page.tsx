import { notFound } from "next/navigation";
import { BRAND_NAME } from "@/app/lib/brand";
import PartnerEsimShareView from "@/app/components/partner/PartnerEsimShareView";
import PartnerSharePageLogo from "@/app/components/partner/PartnerSharePageLogo";
import { getPartnerEsimSharePageData } from "@/app/lib/partner/partnerEsimShareRead";
import { sharePoweredByLabel } from "@/app/lib/partner/partnerShareBrandingValidate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PartnerEsimSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenRaw } = await params;
  const token = (tokenRaw ?? "").trim();
  const data = token ? await getPartnerEsimSharePageData(token) : null;

  if (!data) {
    notFound();
  }

  const companyName = data.branding.companyName;

  return (
    <div className="space-y-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
      <header className="space-y-3">
        <div className="flex flex-col items-center text-center">
          <PartnerSharePageLogo
            src={data.branding.logoUrl}
            alt={companyName || BRAND_NAME}
          />
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            {companyName || BRAND_NAME}
          </p>
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-[var(--heading)]">
          {data.planName}
        </h1>
        <p className="text-center text-sm text-[var(--text-muted)]">
          {data.destinationName}
        </p>
        <div className="flex justify-center">
          <span className="inline-flex rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 px-3 py-1 text-xs font-semibold text-[var(--heading)]">
            {data.statusLabel}
          </span>
        </div>
      </header>
      <PartnerEsimShareView token={token} data={data} />
      <p className="text-center text-xs text-[var(--text-soft)]">
        {sharePoweredByLabel(companyName)}
      </p>
    </div>
  );
}
