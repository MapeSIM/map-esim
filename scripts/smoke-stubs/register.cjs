/**
 * Stubs for running server-only admin modules outside Next.js.
 * Loaded via: npx tsx -r ./scripts/smoke-stubs/register.cjs ...
 *
 * Optional ops-auth overrides (set before importing app modules):
 *   SMOKE_SESSION_USER_ID
 *   SMOKE_SESSION_ROLE=ADMIN|CUSTOMER|PARTNER
 */
const Module = require("module");
const path = require("path");

/**
 * Explicit application role allowlist (mirrors app/lib/auth/appRole.ts).
 * Unknown/invalid roles fail closed — never collapse to CUSTOMER.
 */
function coerceSmokeAppRole(role) {
  if (role === "CUSTOMER" || role === "ADMIN" || role === "PARTNER") {
    return role;
  }
  return null;
}

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

function resolveSmokeSessionRole() {
  const raw = (process.env.SMOKE_SESSION_ROLE || "ADMIN").trim();
  const role = coerceSmokeAppRole(raw);
  if (!role) {
    smokeRedirect("/signin");
  }
  return role;
}

function smokeSessionUser() {
  return {
    id: process.env.SMOKE_SESSION_USER_ID,
    name: "Smoke Session",
    email: "smoke-session@example.invalid",
    role: resolveSmokeSessionRole(),
    needsLegalConsent: false,
    authMethod: "credentials",
  };
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
  if (request === "next/cache") {
    return {
      revalidatePath: () => {},
      revalidateTag: () => {},
      unstable_cache: (fn) => fn,
    };
  }
  if (process.env.SMOKE_SESSION_USER_ID && isAuthSessionRequest(request)) {
    return {
      getSessionUser: async () => smokeSessionUser(),
      requireSession: async () => smokeSessionUser(),
      requireRole: async (role) => {
        const sessionUser = smokeSessionUser();
        if (sessionUser.role !== role) {
          if (sessionUser.role === "ADMIN") smokeRedirect("/admin");
          if (sessionUser.role === "PARTNER") smokeRedirect("/partner");
          smokeRedirect("/signin");
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

exports.coerceSmokeAppRole = coerceSmokeAppRole;

// Silence unused path import if bundlers complain — keep for future path joins.
void path;
