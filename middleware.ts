import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import {
  MAP_DOMAIN_COOKIE,
  MAP_DOMAIN_HEADER,
  MAP_DOMAIN_QUERY,
  PARTNER_SITE_ORIGIN,
  type AppDomain,
  isLocalDevHost,
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
  setFromQuery: boolean
): NextResponse {
  if (setFromQuery) {
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
  const setCookieFromQuery = Boolean(queryDomain);
  const pathname = req.nextUrl.pathname;
  const requestHeaders = withDomainHeaders(req, domain);

  // Retail (mapesim.com / default localhost): B2B docs live only on partneresim.com.
  if (domain === "retail" && isPartnerDocsPath(pathname)) {
    if (isLocalDevHost(host)) {
      const dest = req.nextUrl.clone();
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
  if (domain === "partner" && (pathname === "/signin" || pathname === "/login")) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/";
    const res = NextResponse.redirect(dest);
    return attachDomainCookie(res, domain, setCookieFromQuery);
  }

  // partneresim.com: internal rewrite `/` → `/partner` (URL bar stays `/`).
  // Logged-out → PartnerPortalLogin; PARTNER session → dashboard.
  if (domain === "partner" && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/partner";
    const res = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    return attachDomainCookie(res, domain, setCookieFromQuery);
  }

  // mapesim.store: internal rewrite `/` → `/sandbox` (URL bar stays `/`).
  if (domain === "sandbox" && pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/sandbox";
    const res = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    return attachDomainCookie(res, domain, setCookieFromQuery);
  }

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  return attachDomainCookie(res, domain, setCookieFromQuery);
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
