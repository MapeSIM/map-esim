import type { NextAuthConfig } from "next-auth";
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
        // Role is set authoritatively in auth.ts (DB lookup). Pass through if present.
        if (user.role === "ADMIN" || user.role === "CUSTOMER") {
          token.role = user.role;
        }
      }
      // Preserve authMethod / needsLegalConsent already encoded on the JWT.
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
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
      const role = auth?.user?.role;
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
          return Response.redirect(new URL("/account", request.nextUrl));
        }
        return true;
      }

      if (pathname === "/account" || pathname.startsWith("/account/")) {
        return isLoggedIn;
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
