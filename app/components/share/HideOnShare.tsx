"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  resolveAppDomainFromHost,
  parseAppDomainToken,
  MAP_DOMAIN_COOKIE,
  MAP_DOMAIN_QUERY,
  type AppDomain,
} from "@/app/lib/domain/appDomain";
import { shouldHidePublicSiteChrome } from "@/app/lib/partner/partnerSiteChrome";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

function readClientDomain(): AppDomain {
  if (typeof window === "undefined") return "retail";
  const params = new URLSearchParams(window.location.search);
  const fromQuery = parseAppDomainToken(params.get(MAP_DOMAIN_QUERY));
  if (fromQuery) return fromQuery;
  const fromCookie = parseAppDomainToken(readCookie(MAP_DOMAIN_COOKIE));
  if (fromCookie) return fromCookie;
  return resolveAppDomainFromHost(window.location.host);
}

function subscribeNoop() {
  return () => {};
}

/**
 * Hides public site chrome (nav/footer/JSON-LD/WhatsApp) on share, admin,
 * sandbox paths — and on entire partneresim.com / mapesim.store hosts.
 * mapesim.com /partner/* keeps retail chrome (customer-account shell).
 */
export default function HideOnShare({
  children,
  domain: domainProp,
}: {
  children: React.ReactNode;
  /** Server-resolved domain from middleware header (avoids chrome flash). */
  domain?: AppDomain;
}) {
  const pathname = usePathname() || "/";
  const clientDomain = useSyncExternalStore(
    subscribeNoop,
    readClientDomain,
    () => domainProp ?? ("retail" as AppDomain)
  );
  // Prefer server domain, then client (host / ?__domain= / cookie).
  const domain = domainProp ?? clientDomain;
  // Entire partner + sandbox hosts: hide even if pathname looks retail.
  if (domain === "partner" || domain === "sandbox") return null;
  if (shouldHidePublicSiteChrome(pathname, domain)) return null;
  return <>{children}</>;
}
