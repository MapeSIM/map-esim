import type { NextAuthConfig } from "next-auth";
import { coerceAppRole } from "@/app/lib/auth/appRole";
import { isAllowedDuringLegalConsent } from "@/app/lib/auth/legalConsentPolicy";
import { safeCallbackPath } from "@/app/lib/auth/redirects";

/**
 * Edge-safe Auth.js config (no Prisma / Node crypto imports).
 * Used by middleware for route protection.
 * Session/JWT field mapping must live here so middleware sees `user.role`
 * and Google legal-consent gating flags already stored on the JWT.
 */
export const authConfig = {
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
        const url = new URL("/oauth-consent", request.nextUrl);
        url.searchParams.set("callbackUrl", callback);
        return Response.redirect(url);
      }

      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        if (!isLoggedIn) return false;
        if (role !== "ADMIN") {
          const dest =
            role === "PARTNER" ? "/partner" : role === "CUSTOMER" ? "/account" : "/signin";
          return Response.redirect(new URL(dest, request.nextUrl));
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
        if (!isLoggedIn) return false;
        if (role !== "PARTNER") {
          const dest =
            role === "ADMIN" ? "/admin" : role === "CUSTOMER" ? "/account" : "/signin";
          return Response.redirect(new URL(dest, request.nextUrl));
        }
        return true;
      }

      if (pathname === "/account" || pathname.startsWith("/account/")) {
        if (!isLoggedIn) return false;
        if (role === "PARTNER") {
          if (
            pathname === "/account/esim/buy" ||
            pathname.startsWith("/account/esim/buy/")
          ) {
            const dest = new URL("/partner/buy", request.nextUrl);
            dest.search = request.nextUrl.search;
            return Response.redirect(dest);
          }
          return Response.redirect(new URL("/partner", request.nextUrl));
        }
        if (role === "ADMIN") {
          // Admins may open /account only when explicitly navigating; keep reachable.
          return true;
        }
        if (role !== "CUSTOMER") {
          return Response.redirect(new URL("/signin", request.nextUrl));
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
      // Only same-site/internal destinations. Absolute URLs are reduced to
      // pathname+search when the origin is allowlisted (AUTH_URL / APP_BASE_URL
      // / Auth.js baseUrl). Foreign origins fall back to home — no open redirect.
      let baseOrigin: string;
      try {
        baseOrigin = new URL(baseUrl).origin;
      } catch {
        return baseUrl;
      }
      const safe = safeCallbackPath(url, "", {
        allowedOrigins: [baseOrigin],
      });
      if (!safe) return baseUrl;
      return `${baseOrigin}${safe}`;
    },
  },
} satisfies NextAuthConfig;
