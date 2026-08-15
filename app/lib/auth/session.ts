import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { AppRole } from "@/app/lib/auth/appRole";
import { coerceAppRole } from "@/app/lib/auth/appRole";
import {
  deriveNeedsLegalConsent,
  loadConsentGateUser,
  resolveAuthMethod,
} from "@/app/lib/auth/legalConsentGate";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import { readRequestOrigin } from "@/app/lib/auth/requestOrigin";
import { prisma } from "@/app/lib/db";

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = coerceAppRole(session.user.role);
  if (!role) return null;
  return {
    id: session.user.id,
    name: session.user.name || "",
    email: session.user.email || "",
    role,
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

function defaultPathForRole(role: AppRole): string {
  if (role === "ADMIN") return "/admin";
  if (role === "PARTNER") return "/partner";
  return "/account";
}

export async function requireRole(
  role: AppRole,
  /** Internal return path when unauthenticated (must stay same-site). */
  callbackPath?: string
) {
  const path = callbackPath ?? defaultPathForRole(role);
  const user = await requireSession(path);
  if (user.role !== role) {
    if (user.role === "ADMIN") redirect("/admin");
    if (user.role === "PARTNER") redirect("/partner");
    if (role === "ADMIN" || role === "PARTNER") {
      redirect("/signin");
    }
    redirect("/signin");
  }

  // Defense in depth: disabled ADMIN must not retain admin access via stale JWT.
  if (role === "ADMIN") {
    const dbUser = await loadConsentGateUser(user.id);
    if (
      !dbUser ||
      dbUser.role !== "ADMIN" ||
      dbUser.deletedAt ||
      dbUser.adminDisabledAt
    ) {
      redirect("/signin");
    }
  }

  // Defense in depth: disabled / missing PartnerProfile must not access portal.
  if (role === "PARTNER") {
    const partner = await prisma.partnerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, disabledAt: true },
    });
    const dbUser = await loadConsentGateUser(user.id);
    if (
      !dbUser ||
      dbUser.role !== "PARTNER" ||
      dbUser.deletedAt ||
      !partner ||
      partner.disabledAt
    ) {
      redirect("/signin");
    }
  }

  return user;
}

export function privateNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}
