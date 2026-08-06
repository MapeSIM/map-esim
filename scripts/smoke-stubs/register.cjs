/**
 * Stubs for running server-only admin modules outside Next.js.
 * Loaded via: npx tsx -r ./scripts/smoke-stubs/register.cjs ...
 *
 * Optional ops-auth overrides (set before importing app modules):
 *   SMOKE_SESSION_USER_ID
 *   SMOKE_SESSION_ROLE=ADMIN|CUSTOMER
 */
const Module = require("module");
const path = require("path");

function isAuthSessionRequest(request) {
  const r = String(request).replace(/\\/g, "/");
  return (
    r.endsWith("/app/lib/auth/session") ||
    r.endsWith("/app/lib/auth/session.ts") ||
    r.endsWith("/app/lib/auth/session.js") ||
    r.includes("/app/lib/auth/session'") ||
    request === "@/app/lib/auth/session"
  );
}

function smokeRedirect(url) {
  const err = new Error(`SMOKE_REDIRECT:${url}`);
  err.name = "SmokeRedirect";
  throw err;
}

const originalLoad = Module._load;
Module._load = function smokeStubLoad(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  if (request === "next/headers") {
    return {
      headers: async () => ({
        get(name) {
          const n = String(name).toLowerCase();
          if (n === "sec-fetch-site") return "same-origin";
          if (n === "origin") return "http://localhost:3000";
          if (n === "host") return "localhost:3000";
          if (n === "x-forwarded-host") return "localhost:3000";
          return null;
        },
      }),
    };
  }
  if (request === "next/navigation") {
    return {
      redirect: smokeRedirect,
      notFound: () => {
        const err = new Error("SMOKE_NOT_FOUND");
        err.name = "SmokeNotFound";
        throw err;
      },
      useRouter: () => ({}),
      usePathname: () => "/admin/operations",
      useSearchParams: () => new URLSearchParams(),
    };
  }
  if (process.env.SMOKE_SESSION_USER_ID && isAuthSessionRequest(request)) {
    return {
      getSessionUser: async () => {
        const sessionRole = (process.env.SMOKE_SESSION_ROLE || "ADMIN").trim();
        return {
          id: process.env.SMOKE_SESSION_USER_ID,
          name: "Smoke Session",
          email: "smoke-session@example.invalid",
          role: sessionRole === "ADMIN" ? "ADMIN" : "CUSTOMER",
          needsLegalConsent: false,
          authMethod: "credentials",
        };
      },
      requireSession: async () => {
        const sessionRole = (process.env.SMOKE_SESSION_ROLE || "ADMIN").trim();
        return {
          id: process.env.SMOKE_SESSION_USER_ID,
          name: "Smoke Session",
          email: "smoke-session@example.invalid",
          role: sessionRole === "ADMIN" ? "ADMIN" : "CUSTOMER",
          needsLegalConsent: false,
          authMethod: "credentials",
        };
      },
      requireRole: async (role) => {
        const sessionRole = (process.env.SMOKE_SESSION_ROLE || "ADMIN").trim();
        const sessionUser = {
          id: process.env.SMOKE_SESSION_USER_ID,
          name: "Smoke Session",
          email: "smoke-session@example.invalid",
          role: sessionRole === "ADMIN" ? "ADMIN" : "CUSTOMER",
          needsLegalConsent: false,
          authMethod: "credentials",
        };
        if (sessionUser.role !== role) {
          smokeRedirect(role === "ADMIN" ? "/account" : "/signin");
        }
        return sessionUser;
      },
      privateNoStoreHeaders: () => ({
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      }),
    };
  }
  return originalLoad.apply(this, arguments);
};

// Silence unused path import if bundlers complain — keep for future path joins.
void path;
