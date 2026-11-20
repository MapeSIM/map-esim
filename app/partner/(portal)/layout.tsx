import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PartnerMenu, {
  type PartnerNavLink,
} from "@/app/components/partner/PartnerMenu";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const dynamic = "force-dynamic";
/** Partner buy runs prepare + reserve + VeSIM credit checkout (up to ~25s). */
export const maxDuration = 60;

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const partnerLinks: PartnerNavLink[] = [
  { href: "/partner", label: "Home", exact: true },
  { href: "/partner/catalog", label: "Catalog" },
  { href: "/partner/orders", label: "Orders" },
  { href: "/partner/wallet", label: "Wallet" },
  { href: "/partner/docs", label: "API Docs" },
  { href: "/partner/account", label: "Account" },
];

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    redirect("/signin");
  }

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
            userName={actor.name}
            userEmail={actor.email}
            companyBadge={companyBadge}
            walletBalanceLabel={walletBalanceLabel}
            links={partnerLinks}
          />
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
