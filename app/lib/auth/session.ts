import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  deriveNeedsLegalConsent,
  loadConsentGateUser,
  resolveAuthMethod,
} from "@/app/lib/auth/legalConsentGate";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import { readRequestOrigin } from "@/app/lib/auth/requestOrigin";

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name || "",
    email: session.user.email || "",
    role: (session.user.role === "ADMIN" ? "ADMIN" : "CUSTOMER") as
      | "CUSTOMER"
      | "ADMIN",
    needsLegalConsent: Boolean(session.user.needsLegalConsent),
    authMethod: session.user.authMethod,
  };
}

/**
 * Server-side gate for customer pages/actions.
 * Reloads consent state from the database so a stale JWT cannot bypass
 * /oauth-consent for Google CUSTOMERS. Credentials users are unaffected.
 */
export async function requireSession(callbackPath = "/account") {
  const requestOrigin = await readRequestOrigin();
  const safeCallback = safeCallbackPath(callbackPath, "/account", {
    requestOrigin,
  });
  const user = await getSessionUser();
  if (!user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(safeCallback)}`);
  }

  const dbUser = await loadConsentGateUser(user.id);
  if (!dbUser?.emailVerifiedAt || dbUser.deletedAt) {
    redirect(
      `/signin?callbackUrl=${encodeURIComponent(safeCallback)}`
    );
  }

  const authMethod = resolveAuthMethod({
    tokenAuthMethod: user.authMethod,
    passwordHash: dbUser.passwordHash,
    hasGoogleAccount: dbUser.hasGoogleAccount,
  });

  const needsLegalConsent = deriveNeedsLegalConsent(authMethod, dbUser);
  if (needsLegalConsent) {
    redirect(`/oauth-consent?callbackUrl=${encodeURIComponent(safeCallback)}`);
  }

  return {
    ...user,
    authMethod,
    needsLegalConsent: false as const,
  };
}

export async function requireRole(
  role: "CUSTOMER" | "ADMIN",
  /** Internal return path when unauthenticated (must stay same-site). */
  callbackPath?: string
) {
  const path =
    callbackPath ?? (role === "ADMIN" ? "/admin" : "/account");
  const user = await requireSession(path);
  if (user.role !== role) {
    if (role === "ADMIN") {
      redirect("/account");
    }
    redirect("/signin");
  }
  return user;
}

export function privateNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}
