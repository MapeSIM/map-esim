import { notFound } from "next/navigation";
import { BRAND_NAME } from "@/app/lib/brand";
import PartnerEsimShareView from "@/app/components/partner/PartnerEsimShareView";
import PartnerSharePageLogo from "@/app/components/partner/PartnerSharePageLogo";
import { getPartnerEsimSharePageData } from "@/app/lib/partner/partnerEsimShareRead";
import {
  displayShareCompanyName,
  sharePoweredByLabel,
} from "@/app/lib/partner/partnerShareBrandingValidate";

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
  const companyLabel = displayShareCompanyName(companyName) || BRAND_NAME;
  const websiteUrl = (data.branding.websiteUrl ?? "").trim() || null;

  return (
    <div className="mx-auto min-w-0 w-full max-w-[440px] space-y-5 overflow-x-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-4 py-5 sm:px-5 sm:py-6">
      <header className="flex min-w-0 flex-col items-center text-center">
        <PartnerSharePageLogo
          src={data.branding.logoUrl}
          alt={companyLabel}
        />
        <p className="mt-3 line-clamp-2 max-w-full min-w-0 break-words text-center text-base font-bold leading-snug text-[var(--heading)] [overflow-wrap:anywhere] sm:text-lg">
          {companyLabel}
        </p>
        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="mt-1 max-w-full truncate text-sm font-medium text-[var(--accent-strong)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            {websiteUrl.replace(/^https?:\/\//i, "")}
          </a>
        ) : null}

        <div className="mt-5 flex min-w-0 w-full flex-col items-center gap-2">
          {data.flagUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.flagUrl}
              alt=""
              width={40}
              height={30}
              className="h-7 w-auto object-contain"
            />
          ) : null}
          <h1 className="max-w-full break-words text-xl font-bold tracking-tight text-[var(--heading)] [overflow-wrap:anywhere]">
            {data.planName}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">{data.destinationName}</p>
        </div>
      </header>

      <PartnerEsimShareView token={token} data={data} />

      <p className="mx-auto max-w-full break-words text-center text-xs leading-snug text-[var(--text-soft)] [overflow-wrap:anywhere]">
        {sharePoweredByLabel(companyName)}
      </p>
    </div>
  );
}
