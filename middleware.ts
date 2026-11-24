import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import {
  MAP_DOMAIN_COOKIE,
  MAP_DOMAIN_HEADER,
  MAP_DOMAIN_QUERY,
  PARTNER_SITE_ORIGIN,
  RETAIL_SITE_ORIGIN,
  type AppDomain,
  isLocalDevHost,
  partnerPathToSandboxPath,
  publicUrlForRequest,
  resolveAppDomain,
} from "@/app/lib/domain/appDomain";

const { auth } = NextAuth(authConfig);

function requestHost(req: { headers: Headers }): string {
  return (
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    ""
  )
    .split(",")[0]
    .trim();
}

function isPartnerDocsPath(pathname: string): boolean {
  return (
    pathname === "/partner/docs" ||
    pathname.startsWith("/partner/docs/") ||
    pathname === "/api/partner/docs" ||
    pathname.startsWith("/api/partner/docs/")
  );
}

function withDomainHeaders(
  req: { headers: Headers; nextUrl: URL },
  domain: AppDomain
): Headers {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-map-pathname", req.nextUrl.pathname);
  // Preserve query for auth return paths (e.g. abandoned checkout review).
  requestHeaders.set("x-map-search", req.nextUrl.search);
  requestHeaders.set(MAP_DOMAIN_HEADER, domain);
  return requestHeaders;
}

function attachDomainCookie(
  res: NextResponse,
  domain: AppDomain,
  persist: boolean
): NextResponse {
  // Persist for partner/sandbox hosts and ?__domain= overrides so client
  // chrome-hiding (HideOnShare) matches the server domain even when AUTH_URL
  // rewrites nextUrl to mapesim.com.
  if (persist) {
    res.cookies.set(MAP_DOMAIN_COOKIE, domain, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return res;
}

export default auth((req) => {
  const host = requestHost(req);
  const queryDomain = req.nextUrl.searchParams.get(MAP_DOMAIN_QUERY);
  const cookieDomain = req.cookies.get(MAP_DOMAIN_COOKIE)?.value ?? null;
  const domain = resolveAppDomain({
    host,
    queryDomain,
    cookieDomain,
  });
  // Always persist non-retail domains + explicit query overrides.
  const persistDomainCookie = Boolean(queryDomain) || domain !== "retail";
  const pathname = req.nextUrl.pathname;
  const requestHeaders = withDomainHeaders(req, domain);

  // Canonical admin host is mapesim.com — avoid ambiguous /admin on B2B/sandbox hosts.
  // Localhost keeps /admin on the current origin for DX (?__domain= overrides still work).
  if (
    !isLocalDevHost(host) &&
    (domain === "partner" || domain === "sandbox") &&
    (pathname === "/admin" || pathname.startsWith("/admin/"))
  ) {
    const dest = new URL(
      `${pathname}${req.nextUrl.search}`,
      RETAIL_SITE_ORIGIN
    );
    return NextResponse.redirect(dest);
  }

  // Retail (mapesim.com / default localhost): B2B docs live only on partneresim.com.
  if (domain === "retail" && isPartnerDocsPath(pathname)) {
    if (isLocalDevHost(host)) {
      const dest = publicUrlForRequest(
        req,
        pathname,
        req.nextUrl.search || undefined
      );
      dest.searchParams.set(MAP_DOMAIN_QUERY, "partneresim.com");
      const res = NextResponse.redirect(dest);
      return attachDomainCookie(res, "partner", true);
    }
    const dest = new URL(
      `${pathname}${req.nextUrl.search}`,
      PARTNER_SITE_ORIGIN
    );
    return NextResponse.redirect(dest);
  }

  // partneresim.com: keep auth on clean `/` login (not /signin URL).
  // Strip Auth.js callbackUrl so we never bounce to mapesim.com/?callbackUrl=…
  if (domain === "partner" && (pathname === "/signin" || pathname === "/login")) {
    const dest = publicUrlForRequest(req, "/");
    const res = NextResponse.redirect(dest);
    return attachDomainCookie(res, domain, persistDomainCookie);
  }

  // partneresim.com: internal rewrite `/` → `/partner` (URL bar stays `/`).
  // IMPORTANT: build rewrite on the real public origin — Auth.js may have
  // replaced nextUrl with AUTH_URL (mapesim.com), which would leak retail chrome.
  if (domain === "partner" && pathname === "/") {
    const url = publicUrlForRequest(req, "/partner", req.nextUrl.search || undefined);
    const res = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    return attachDomainCookie(res, domain, persistDomainCookie);
  }

  // mapesim.store: internal rewrite `/` → `/sandbox` (URL bar stays `/`).
  if (domain === "sandbox" && pathname === "/") {
    const url = publicUrlForRequest(req, "/sandbox", req.nextUrl.search || undefined);
    const res = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    return attachDomainCookie(res, domain, persistDomainCookie);
  }

  // mapesim.store: keep storefront traffic inside the sandbox portal.
  if (domain === "sandbox") {
    if (
      pathname === "/signin" ||
      pathname === "/login" ||
      pathname === "/signup"
    ) {
      const dest = publicUrlForRequest(req, "/sandbox");
      return attachDomainCookie(
        NextResponse.redirect(dest),
        domain,
        persistDomainCookie
      );
    }
    // Never serve live /partner/* chrome on sandbox — mirror partner UX via /sandbox/*.
    if (pathname === "/partner" || pathname.startsWith("/partner/")) {
      const mapped = partnerPathToSandboxPath(pathname) ?? "/sandbox";
      const [mappedPath, mappedQuery] = mapped.split("?");
      const dest = publicUrlForRequest(
        req,
        mappedPath || "/sandbox",
        mappedQuery
          ? `?${mappedQuery}`
          : req.nextUrl.search || undefined
      );
      if (mappedQuery && req.nextUrl.search) {
        const existing = new URLSearchParams(req.nextUrl.search);
        existing.forEach((value, key) => {
          if (!dest.searchParams.has(key)) dest.searchParams.set(key, value);
        });
      }
      return attachDomainCookie(
        NextResponse.redirect(dest),
        domain,
        persistDomainCookie
      );
    }
    if (pathname === "/countries" || pathname.startsWith("/countries/")) {
      const rest =
        pathname === "/countries" ? "" : pathname.slice("/countries".length);
      const dest = publicUrlForRequest(
        req,
        `/sandbox/catalog${rest}`,
        req.nextUrl.search || undefined
      );
      return attachDomainCookie(
        NextResponse.redirect(dest),
        domain,
        persistDomainCookie
      );
    }
    if (pathname === "/account" || pathname.startsWith("/account/")) {
      const dest =
        pathname === "/account/esim/buy" ||
        pathname.startsWith("/account/esim/buy/")
          ? publicUrlForRequest(
              req,
              "/sandbox/catalog",
              req.nextUrl.search || undefined
            )
          : publicUrlForRequest(req, "/sandbox");
      return attachDomainCookie(
        NextResponse.redirect(dest),
        domain,
        persistDomainCookie
      );
    }
  }

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return attachDomainCookie(res, domain, persistDomainCookie);
});

export const config = {
  matcher: [
    /*
     * Explicit `/` — path-to-regexp groups often skip the bare root, but
     * partneresim.com + mapesim.store need root rewrites.
     * Auth gates still apply via auth.config authorized() for partner/admin/account.
     */
    "/",
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
