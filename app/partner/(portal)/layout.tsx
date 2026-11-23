import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountMenu, {
  type AccountNavLink,
} from "@/app/components/account/AccountMenu";
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

/** mapesim.com — 6a9cf44 customer-account nav (no API Docs). */
const retailAccountLinks: AccountNavLink[] = [
  { href: "/partner", label: "Overview", exact: true },
  { href: "/partner/orders", label: "My eSIMs" },
  { href: "/partner/sales", label: "Sales" },
  { href: "/partner/wallet", label: "Wallet" },
  { href: "/countries", label: "Buy eSIM" },
  { href: "/partner/profile", label: "Profile" },
  { href: "/partner/security", label: "Security" },
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
    redirect("/");
  }

  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    redirect(domain === "partner" ? "/?denied=1" : "/signin");
  }

  // mapesim.com — 6a9cf44 AccountMenu customer shell.
  if (domain !== "partner") {
    return (
      <main className="min-h-screen w-full max-w-full bg-[var(--page-bg)] px-3 py-8 text-[var(--heading)] sm:px-6 sm:py-10">
        <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5">
          <header className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
            <AccountMenu
              userName={user.name}
              userEmail={user.email}
              links={retailAccountLinks}
            />
          </header>
          <section className="min-w-0 w-full max-w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
            {children}
          </section>
        </div>
      </main>
    );
  }

  // partneresim.com — keep dark B2B PartnerMenu shell.
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
            mode="b2b"
            userName={actor.name}
            userEmail={actor.email}
            companyBadge={companyBadge}
            walletBalanceLabel={walletBalanceLabel}
            links={b2bPartnerLinks}
            brandLabel="MAP eSIM"
            brandSuffix="Partner"
            homeHref="/"
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
