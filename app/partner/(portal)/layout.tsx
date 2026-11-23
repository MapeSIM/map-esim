import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import PartnerMenu, {
  type PartnerNavLink,
} from "@/app/components/partner/PartnerMenu";
import PartnerPortalLogin from "@/app/components/partner/PartnerPortalLogin";
import PartnerAccessDenied from "@/app/components/partner/PartnerAccessDenied";
import { getSessionUser, requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  isLocalDevHost,
  isPartnerLandingPath,
  MAP_DOMAIN_QUERY,
  RETAIL_SITE_ORIGIN,
} from "@/app/lib/domain/appDomain";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const retailPartnerLinks: PartnerNavLink[] = [
  { href: "/partner", label: "Home", exact: true },
  { href: "/partner/countries", label: "Catalog" },
  { href: "/partner/orders", label: "Orders" },
  { href: "/partner/wallet", label: "Wallet" },
  { href: "/partner/account", label: "Account" },
];

const b2bPartnerLinks: PartnerNavLink[] = [
  { href: "/", label: "Home", exact: true },
  { href: "/partner/docs", label: "API docs" },
  { href: "/partner/countries", label: "Catalog" },
  { href: "/partner/orders", label: "Orders" },
  { href: "/partner/wallet", label: "Wallet" },
  { href: "/partner/account", label: "Account" },
];

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = await readAppDomain();
  const h = await headers();
  const pathname =
    h.get("x-map-pathname") || h.get("x-pathname") || "/partner";
  const host = h.get("x-forwarded-host") || h.get("host");
  const retailHref = isLocalDevHost(host)
    ? `/?${MAP_DOMAIN_QUERY}=mapesim.com`
    : RETAIL_SITE_ORIGIN;
  const sessionUser = await getSessionUser();
  const isPartnerSession = sessionUser?.role === "PARTNER";
  const denied =
    h.get("x-map-search")?.includes("denied=1") ||
    pathname.includes("denied=1");

  // Also read denied from forwarded search header set by middleware.
  const search = h.get("x-map-search") || "";
  const isDenied = search.includes("denied=1") || denied;

  if (domain === "partner" && sessionUser && !isPartnerSession) {
    return <PartnerAccessDenied retailHref={retailHref} />;
  }

  if (
    domain === "partner" &&
    isPartnerLandingPath(pathname) &&
    !isPartnerSession
  ) {
    return (
      <PartnerPortalLogin
        mode="partner"
        callbackUrl="/"
        retailHref={retailHref}
      />
    );
  }

  if (domain === "partner" && isDenied && !isPartnerSession) {
    return <PartnerAccessDenied retailHref={retailHref} />;
  }

  if (domain === "partner" && !isPartnerSession) {
    redirect("/signin?callbackUrl=/");
  }

  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    redirect(domain === "partner" ? "/?denied=1" : "/signin");
  }

  const isB2b = domain === "partner";
  const partnerLinks = isB2b ? b2bPartnerLinks : retailPartnerLinks;

  const branding = await prisma.partnerProfile.findUnique({
    where: { id: actor.partnerId },
    select: {
      brandCompanyName: true,
      shareCompanyName: true,
      walletAccount: { select: { balanceCents: true } },
    },
  });
  const companyBadge =
    branding?.brandCompanyName || branding?.shareCompanyName || actor.name;
  const walletBalanceLabel = formatUsdCents(
    branding?.walletAccount?.balanceCents ?? 0
  );

  return (
    <div className="min-h-screen w-full bg-[#070D19] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070D19]/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6">
          <PartnerMenu
            mode={isB2b ? "b2b" : "retail"}
            userName={actor.name}
            userEmail={actor.email}
            companyBadge={companyBadge}
            walletBalanceLabel={walletBalanceLabel}
            links={partnerLinks}
            brandLabel="MAP eSIM"
            brandSuffix="Partner"
            homeHref={isB2b ? "/" : "/partner"}
            walletHref="/partner/wallet"
            accountHref="/partner/account"
          />
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
