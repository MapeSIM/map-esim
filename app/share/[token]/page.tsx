import { notFound } from "next/navigation";
import { BRAND_LOGO_DARK_PUBLIC_PATH, BRAND_NAME } from "@/app/lib/brand";
import PartnerEsimShareView from "@/app/components/partner/PartnerEsimShareView";
import { getPartnerEsimSharePageData } from "@/app/lib/partner/partnerEsimShareRead";

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
  const logoSrc = data.branding.logoUrl || BRAND_LOGO_DARK_PUBLIC_PATH;

  return (
    <div className="space-y-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
      <header className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt={companyName || BRAND_NAME}
          width={160}
          height={40}
          className="h-10 w-auto max-w-[180px] object-contain"
          referrerPolicy="no-referrer"
        />
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          {companyName || BRAND_NAME}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
          Your eSIM is ready
        </h1>
      </header>
      <PartnerEsimShareView token={token} data={data} />
      <p className="text-center text-xs text-[var(--text-soft)]">
        Powered by {BRAND_NAME}
      </p>
    </div>
  );
}
