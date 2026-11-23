import Link from "next/link";
import {
  BookOpen,
  KeyRound,
  Package,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

export type PartnerPortalHomeCard = {
  href: string;
  title: string;
  description: string;
  icon: "docs" | "catalog" | "orders" | "wallet" | "account";
};

const ICONS = {
  docs: BookOpen,
  catalog: ShoppingBag,
  orders: Package,
  wallet: Wallet,
  account: KeyRound,
} as const;

export const B2B_HOME_CARDS: PartnerPortalHomeCard[] = [
  {
    href: "/partner/docs",
    title: "API documentation",
    description:
      "Endpoint reference, Postman collection, and environment downloads for /api/v1/partner.",
    icon: "docs",
  },
  {
    href: "/partner/countries",
    title: "Catalog",
    description:
      "Browse the same wholesale destinations and plans as the MAP eSIM storefront.",
    icon: "catalog",
  },
  {
    href: "/partner/orders",
    title: "Orders",
    description:
      "Track Partner purchases with Orders and Performance tabs.",
    icon: "orders",
  },
  {
    href: "/partner/wallet",
    title: "Wallet",
    description:
      "Top up with $100–$1000 presets and review prepaid USD transaction history.",
    icon: "wallet",
  },
  {
    href: "/partner/account",
    title: "Account",
    description:
      "Profile, white-label Share QR branding, and Partner API keys.",
    icon: "account",
  },
];

/** Same card copy as B2B — sandbox mirrors partneresim.com visually. */
export const SANDBOX_HOME_CARDS: PartnerPortalHomeCard[] = [
  {
    href: "/sandbox/docs",
    title: "API documentation",
    description:
      "Endpoint reference, Postman collection, and environment downloads for /api/v1/partner.",
    icon: "docs",
  },
  {
    href: "/sandbox/catalog",
    title: "Catalog",
    description:
      "Browse the same wholesale destinations and plans as the MAP eSIM storefront.",
    icon: "catalog",
  },
  {
    href: "/sandbox/orders",
    title: "Orders",
    description:
      "Track Partner purchases with Orders and Performance tabs.",
    icon: "orders",
  },
  {
    href: "/sandbox/wallet",
    title: "Wallet",
    description:
      "Top up with $100–$1000 presets and review prepaid USD transaction history.",
    icon: "wallet",
  },
  {
    href: "/sandbox/account",
    title: "Account",
    description:
      "Profile, white-label Share QR branding, and Partner API keys.",
    icon: "account",
  },
];

export default function PartnerPortalHomeCards({
  cards,
  eyebrow,
  title,
  subtitle,
}: {
  cards: readonly PartnerPortalHomeCard[];
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
          {eyebrow}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-50">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
          {subtitle}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = ICONS[card.icon];
          return (
            <Link
              key={card.href}
              href={card.href}
              className={`${partnerCardClass} group block transition hover:border-emerald-500/30 hover:bg-white/[0.04]`}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 transition group-hover:bg-emerald-500/20 group-hover:text-emerald-300">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-lg font-semibold text-slate-50">
                {card.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                {card.description}
              </p>
              <span className="mt-4 inline-flex text-sm font-semibold text-emerald-400 group-hover:text-emerald-300">
                Open →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
