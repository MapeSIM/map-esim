import "server-only";

import { headers } from "next/headers";
import {
  MAP_DOMAIN_HEADER,
  type AppDomain,
  parseAppDomainToken,
  resolveAppDomainFromHost,
} from "@/app/lib/domain/appDomain";

/** Server Components / Route Handlers — prefer middleware-injected header. */
export async function readAppDomain(): Promise<AppDomain> {
  const h = await headers();
  const fromHeader = parseAppDomainToken(h.get(MAP_DOMAIN_HEADER));
  if (fromHeader) return fromHeader;
  const host = h.get("x-forwarded-host") || h.get("host");
  return resolveAppDomainFromHost(host);
}

export async function isPartnerPortalDomain(): Promise<boolean> {
  return (await readAppDomain()) === "partner";
}

export async function isRetailDomain(): Promise<boolean> {
  return (await readAppDomain()) === "retail";
}
