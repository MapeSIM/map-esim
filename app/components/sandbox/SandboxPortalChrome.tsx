"use client";

import { useEffect, useState } from "react";
import PartnerMenu, {
  type PartnerNavLink,
} from "@/app/components/partner/PartnerMenu";
import {
  SANDBOX_DEFAULT_BALANCE_CENTS,
} from "@/app/lib/sandbox/sandboxShared";
import { SANDBOX_WALLET_KEY } from "@/app/lib/sandbox/sandboxClientStorage";

const links: PartnerNavLink[] = [
  { href: "/sandbox", label: "Home", exact: true },
  { href: "/sandbox/docs", label: "API docs" },
  { href: "/sandbox/catalog", label: "Catalog" },
  { href: "/sandbox/orders", label: "Orders" },
  { href: "/sandbox/wallet", label: "Wallet" },
  { href: "/sandbox/account", label: "Account" },
];

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function SandboxPortalChrome() {
  const [balanceLabel, setBalanceLabel] = useState(
    formatUsd(SANDBOX_DEFAULT_BALANCE_CENTS)
  );

  useEffect(() => {
    function sync() {
      try {
        const raw = localStorage.getItem(SANDBOX_WALLET_KEY);
        const cents =
          raw != null && Number.isFinite(Number(raw))
            ? Number(raw)
            : SANDBOX_DEFAULT_BALANCE_CENTS;
        setBalanceLabel(formatUsd(cents));
      } catch {
        /* ignore */
      }
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    const id = window.setInterval(sync, 1500);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.clearInterval(id);
    };
  }, []);

  return (
    <PartnerMenu
      mode="sandbox"
      userName="Sandbox Partner"
      userEmail="sandbox@mapesim.store"
      companyBadge="Sandbox Demo Co"
      walletBalanceLabel={balanceLabel}
      links={links}
      brandLabel="MAP eSIM"
      brandSuffix="Partner"
      homeHref="/sandbox"
      walletHref="/sandbox/wallet"
      accountHref="/sandbox/account"
    />
  );
}
