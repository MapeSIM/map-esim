import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PartnerMenu, {
  type PartnerNavLink,
} from "@/app/components/partner/PartnerMenu";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";

export const dynamic = "force-dynamic";
/** Partner buy runs prepare + reserve + VeSIM credit checkout (up to ~25s). */
export const maxDuration = 60;

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const partnerLinks: PartnerNavLink[] = [
  { href: "/partner", label: "Home", exact: true },
  { href: "/partner/docs", label: "API docs" },
  { href: "/partner/catalog", label: "Catalog" },
  { href: "/partner/orders", label: "Orders" },
  { href: "/partner/wallet", label: "Wallet" },
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
    },
  });
  const companyBadge =
    branding?.brandCompanyName || branding?.shareCompanyName || actor.name;

  return (
    <main className="min-h-screen w-full max-w-full bg-[#020617] px-3 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5">
        <header className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-4 shadow-[0_0_0_1px_rgba(16,185,129,0.08)] sm:px-5">
          <PartnerMenu
            userName={actor.name}
            userEmail={actor.email}
            companyBadge={companyBadge}
            links={partnerLinks}
          />
        </header>
        <section className="min-w-0 w-full max-w-full rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
