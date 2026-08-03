import type { NextAuthConfig } from "next-auth";
import { isAllowedDuringLegalConsent } from "@/app/lib/auth/legalConsentPolicy";

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

      // /checkout and /payment remain publicly reachable for guests, but
      // consent-required Google customers are redirected above.
      return true;
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) return url;
      } catch {
        // ignore
      }
      return baseUrl;
    },
  },
} satisfies NextAuthConfig;
