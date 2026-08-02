import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no Prisma / Node crypto imports).
 * Used by middleware for route protection.
 * Session/JWT field mapping must live here so middleware sees `user.role`.
 */
export const authConfig = {
  pages: {
    signIn: "/signin",
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
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "CUSTOMER";
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const role = auth?.user?.role;

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
