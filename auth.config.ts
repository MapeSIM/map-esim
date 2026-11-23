import type { NextAuthConfig } from "next-auth";
import { coerceAppRole } from "@/app/lib/auth/appRole";
import { isAllowedDuringLegalConsent } from "@/app/lib/auth/legalConsentPolicy";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import {
  isPartnerLandingPath,
  multiDomainAllowedOrigins,
  publicUrlForRequest,
  resolveAppDomainFromRequest,
} from "@/app/lib/domain/appDomain";

/**
 * Edge-safe Auth.js config (no Prisma / Node crypto imports).
 * Used by middleware for route protection.
 * Session/JWT field mapping must live here so middleware sees `user.role`
 * and Google legal-consent gating flags already stored on the JWT.
 */
export const authConfig = {
  // Required for self-hosted / reverse-proxy production (DigitalOcean, nginx).
  // Auth.js only auto-trusts Vercel/Cloudflare Pages otherwise.
  trustHost: true,
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        // Role is set authoritatively in auth.ts (DB lookup). Pass through allowlist only.
        const role = coerceAppRole(user.role);
        if (role) {
          token.role = role;
        }
      }
      // Preserve authMethod / needsLegalConsent already encoded on the JWT.
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        const role = coerceAppRole(token.role);
        // Fail closed to empty id path if role missing — never invent CUSTOMER.
        session.user.role = role ?? "CUSTOMER";
        if (!role) {
          session.user.id = "";
        }
        session.user.needsLegalConsent = Boolean(token.needsLegalConsent);
        session.user.authMethod =
          token.authMethod === "google" || token.authMethod === "credentials"
            ? token.authMethod
            : undefined;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user?.id);
      const role = coerceAppRole(auth?.user?.role);
      const needsLegalConsent = Boolean(auth?.user?.needsLegalConsent);

      // Google CUSTOMER with incomplete consent: allow only consent + legal + Auth.js.
      // All other matched protected routes redirect (prevents /account bypass).
      if (needsLegalConsent && isLoggedIn) {
        if (isAllowedDuringLegalConsent(pathname)) {
          return true;
        }

        const callback = `${pathname}${request.nextUrl.search || ""}`;
        const url = publicUrlForRequest(request, "/oauth-consent");
        url.searchParams.set("callbackUrl", callback);
        return Response.redirect(url);
      }

      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        if (!isLoggedIn) return false;
        if (role !== "ADMIN") {
          const dest =
            role === "PARTNER" ? "/partner" : role === "CUSTOMER" ? "/account" : "/signin";
          return Response.redirect(publicUrlForRequest(request, dest));
        }
        return true;
      }

      if (
        pathname === "/partner/setup-password" ||
        pathname.startsWith("/partner/setup-password/")
      ) {
        // Public one-time Partner invitation password setup (opaque token / setup cookie).
        return true;
      }

      if (pathname === "/partner" || pathname.startsWith("/partner/")) {
        const domain = resolveAppDomainFromRequest(request);
        // partneresim.com: allow logged-out visitors on landing (login view).
        // Never `return false` here — Auth.js would redirect via AUTH_URL
        // (mapesim.com/signin?callbackUrl=…). Stay on the partner host.
        if (!isLoggedIn) {
          if (domain === "partner") {
            if (isPartnerLandingPath(pathname)) {
              return true;
            }
            return Response.redirect(publicUrlForRequest(request, "/"));
          }
          return false;
        }
        if (role !== "PARTNER") {
          // Strict partner role on partneresim.com — never drop customers into B2B.
          if (domain === "partner") {
            const denied = publicUrlForRequest(request, "/");
            denied.searchParams.set("denied", "1");
            return Response.redirect(denied);
          }
          const dest =
            role === "ADMIN" ? "/admin" : role === "CUSTOMER" ? "/account" : "/signin";
          return Response.redirect(publicUrlForRequest(request, dest));
        }
        return true;
      }

      if (pathname === "/account" || pathname.startsWith("/account/")) {
        const domain = resolveAppDomainFromRequest(request);
        // mapesim.store: never bounce sandbox users to retail /signin.
        if (domain === "sandbox") {
          if (
            pathname === "/account/esim/buy" ||
            pathname.startsWith("/account/esim/buy/")
          ) {
            return Response.redirect(
              publicUrlForRequest(
                request,
                "/sandbox/catalog",
                request.nextUrl.search || undefined
              )
            );
          }
          return Response.redirect(publicUrlForRequest(request, "/sandbox"));
        }
        if (!isLoggedIn) return false;
        if (role === "PARTNER") {
          if (
            pathname === "/account/esim/buy" ||
            pathname.startsWith("/account/esim/buy/")
          ) {
            // Partner Buy Now / shared buy links → confirm purchase, not destinations.
            const dest = publicUrlForRequest(
              request,
              "/partner/buy",
              request.nextUrl.search || undefined
            );
            return Response.redirect(dest);
          }
          return Response.redirect(publicUrlForRequest(request, "/partner"));
        }
        if (role === "ADMIN") {
          // Admins may open /account only when explicitly navigating; keep reachable.
          return true;
        }
        if (role !== "CUSTOMER") {
          return Response.redirect(publicUrlForRequest(request, "/signin"));
        }
        return true;
      }

      if (pathname === "/oauth-consent") {
        return isLoggedIn;
      }

      // /checkout (legacy guest) and /payment (future gateway reserved) stay
      // publicly reachable, but consent-required Google customers are redirected above.
      // Soft-launch Buy CTAs use /account/esim/buy instead of these routes.
      return true;
    },
    redirect({ url, baseUrl }) {
      // Only same-site/internal destinations. Absolute URLs on allowlisted
      // origins keep THAT origin (so partneresim.com / mapesim.store logins
      // never bounce to AUTH_URL / mapesim.com). Relative paths use baseUrl.
      const allowed = multiDomainAllowedOrigins();
      let baseOrigin: string;
      try {
        baseOrigin = new URL(baseUrl).origin;
      } catch {
        return baseUrl;
      }
      const allowedOrigins = [baseOrigin, ...allowed];

      let preferOrigin = baseOrigin;
      const trimmed = (url || "").trim();
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        try {
          const absolute = new URL(trimmed);
          if (allowedOrigins.includes(absolute.origin)) {
            preferOrigin = absolute.origin;
          }
        } catch {
          /* fall through */
        }
      }

      const safe = safeCallbackPath(url, "", { allowedOrigins });
      if (!safe) return preferOrigin === baseOrigin ? baseUrl : `${preferOrigin}/`;
      return `${preferOrigin}${safe}`;
    },
  },
} satisfies NextAuthConfig;
