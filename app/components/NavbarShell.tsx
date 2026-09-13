"use client";

import { useEffect, useState } from "react";
import { coerceAppRole } from "@/app/lib/auth/appRole";
import { navAuthLink } from "@/app/lib/auth/redirects";
import Navbar, { type NavbarCustomerSummary } from "./Navbar";

type SessionPayload = {
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
} | null;

/**
 * Client session island for the public shell.
 * Root layout stays free of auth()/cookies() so marketing/catalog HTML can cache.
 * Auth behavior matches the previous server-resolved Navbar props.
 */
export default function NavbarShell() {
  const [authHref, setAuthHref] = useState("/signin");
  const [authLabel, setAuthLabel] = useState("Sign in");
  const [customer, setCustomer] = useState<NavbarCustomerSummary | null>(null);
  const [partner, setPartner] = useState<NavbarCustomerSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((session: SessionPayload) => {
        if (cancelled || !session?.user?.id) return;

        const sessionRole = coerceAppRole(session.user.role);
        const { href, label } = navAuthLink({
          userId: session.user.id,
          role: sessionRole,
        });
        setAuthHref(href);
        setAuthLabel(label);

        // Lightweight nav identity only — never wallet/partner portal aggregates.
        if (sessionRole === "CUSTOMER") {
          setCustomer({
            name: (session.user.name ?? "").trim() || "Customer",
            email: (session.user.email ?? "").trim(),
            walletBalanceLabel: null,
            walletCurrency: "USD",
          });
          setPartner(null);
          return;
        }

        if (sessionRole === "PARTNER") {
          setPartner({
            name: (session.user.name ?? "").trim() || "Partner",
            email: (session.user.email ?? "").trim(),
            walletBalanceLabel: null,
            walletCurrency: "USD",
          });
          setCustomer(null);
        }
      })
      .catch(() => {
        // Keep logged-out defaults.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Navbar
      authHref={authHref}
      authLabel={authLabel}
      customer={customer}
      partner={partner}
    />
  );
}
