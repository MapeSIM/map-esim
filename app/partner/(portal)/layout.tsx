import type { Metadata } from "next";
import PartnerMenu, {
  type PartnerNavLink,
} from "@/app/components/partner/PartnerMenu";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const partnerLinks: PartnerNavLink[] = [
  { href: "/partner", label: "Home", exact: true },
  { href: "/partner/wallet", label: "Wallet" },
  { href: "/partner/catalog", label: "Catalog" },
  { href: "/partner/orders", label: "Orders" },
];

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("PARTNER");

  return (
    <main className="min-h-screen w-full max-w-full bg-[var(--page-bg)] px-3 py-8 text-[var(--heading)] sm:px-6 sm:py-10">
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
        <header className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
          <PartnerMenu
            userName={user.name}
            userEmail={user.email}
            links={partnerLinks}
          />
        </header>
        <section className="min-w-0 w-full max-w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
