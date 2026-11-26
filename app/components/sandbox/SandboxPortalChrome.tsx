"use client";

import { useEffect, useMemo, useState } from "react";
import PartnerMenu, {
  type PartnerNavLink,
} from "@/app/components/partner/PartnerMenu";
import { SANDBOX_DEFAULT_BALANCE_CENTS } from "@/app/lib/sandbox/sandboxShared";
import { SANDBOX_WALLET_KEY } from "@/app/lib/sandbox/sandboxClientStorage";

const baseLinks: PartnerNavLink[] = [
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
  const [userName, setUserName] = useState("Sandbox Partner");
  const [userEmail, setUserEmail] = useState("sandbox@mapesim.store");
  const [companyBadge, setCompanyBadge] = useState("Sandbox Demo Co");
  const [showApiDocs, setShowApiDocs] = useState(true);

  const links = useMemo(
    () =>
      baseLinks.filter((link) =>
        link.href === "/sandbox/docs" ? showApiDocs : true
      ),
    [showApiDocs]
  );

  useEffect(() => {
    function syncLocal() {
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

    async function syncSession() {
      try {
        const res = await fetch("/api/sandbox/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          showApiUi?: boolean;
          partner?: {
            name: string;
            email: string;
            balanceCents: number;
          };
        };
        if (data.ok && data.partner) {
          setUserName(data.partner.name);
          setUserEmail(data.partner.email);
          setCompanyBadge(data.partner.name);
          setBalanceLabel(formatUsd(data.partner.balanceCents));
          setShowApiDocs(data.showApiUi === true);
          try {
            localStorage.setItem(
              SANDBOX_WALLET_KEY,
              String(data.partner.balanceCents)
            );
          } catch {
            /* ignore */
          }
          return;
        }
        // Auth.js ADMIN on hub may have no partner session.
        setShowApiDocs(false);
      } catch {
        /* fall through to local cache */
      }
      syncLocal();
    }

    void syncSession();
    window.addEventListener("storage", syncLocal);
    window.addEventListener("focus", syncLocal);
    const id = window.setInterval(syncLocal, 2000);
    return () => {
      window.removeEventListener("storage", syncLocal);
      window.removeEventListener("focus", syncLocal);
      window.clearInterval(id);
    };
  }, []);

  return (
    <PartnerMenu
      mode="sandbox"
      userName={userName}
      userEmail={userEmail}
      companyBadge={companyBadge}
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
