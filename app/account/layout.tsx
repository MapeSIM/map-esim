import type { Metadata } from "next";
import AccountMenu, {
  type AccountNavLink,
} from "@/app/components/account/AccountMenu";
import { requireSession } from "@/app/lib/auth/session";
import { isPaymentGatewayConfigured } from "@/app/lib/payments/disabledAdapter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const baseLinks: AccountNavLink[] = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/orders", label: "My eSIMs" },
  { href: "/account/wallet", label: "Wallet" },
  { href: "/account/esim/buy", label: "Buy eSIM" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
];

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const links = isPaymentGatewayConfigured()
    ? [
        ...baseLinks.slice(0, 3),
        { href: "/account/wallet/top-up", label: "Add funds" },
        ...baseLinks.slice(3),
      ]
    : baseLinks;

  return (
    <main className="min-h-screen w-full max-w-full bg-[var(--page-bg)] px-3 py-8 text-[var(--heading)] sm:px-6 sm:py-10">
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4">
        <header className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
          <AccountMenu
            userName={user.name}
            userEmail={user.email}
            links={links}
          />
        </header>
        <section className="min-w-0 w-full max-w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
