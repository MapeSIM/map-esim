import { cache } from "react";
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

type SessionAuthMethod = ReturnType<typeof resolveAuthMethod> | undefined;

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  needsLegalConsent: boolean;
  authMethod: SessionAuthMethod;
};

/**
 * Request-scoped session read. Layout + page + nested requireRole helpers
 * share one auth() decode per RSC/action tree without weakening gates.
 */
const readSessionUser = cache(async (): Promise<SessionUser | null> => {
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
});

export async function getSessionUser() {
  return readSessionUser();
}

type ValidatedSession =
  | {
      ok: true;
      user: SessionUser & {
        authMethod: ReturnType<typeof resolveAuthMethod>;
        needsLegalConsent: false;
      };
    }
  | { ok: false; reason: "unauthenticated" | "unverified" | "consent" };

/**
 * Consent + email-verified gate shared across requireSession calls that only
 * differ by callbackPath (layout deep-link vs page default).
 */
const validateSessionAndConsent = cache(
  async (): Promise<ValidatedSession> => {
    const user = await getSessionUser();
    if (!user) {
      return { ok: false, reason: "unauthenticated" };
    }

    const dbUser = await loadConsentGateUser(user.id);
    if (!dbUser?.emailVerifiedAt || dbUser.deletedAt) {
      return { ok: false, reason: "unverified" };
    }

    const authMethod = resolveAuthMethod({
      tokenAuthMethod: user.authMethod,
      passwordHash: dbUser.passwordHash,
      hasGoogleAccount: dbUser.hasGoogleAccount,
    });

    const needsLegalConsent = deriveNeedsLegalConsent(authMethod, dbUser);
    if (needsLegalConsent) {
      return { ok: false, reason: "consent" };
    }

    return {
      ok: true,
      user: {
        ...user,
        authMethod,
        needsLegalConsent: false as const,
      },
    };
  }
);

/** Partner portal gate row — layout + page double requireRole share one read. */
const loadPartnerGateProfile = cache(async (userId: string) => {
  return prisma.partnerProfile.findUnique({
    where: { userId },
    select: { id: true, disabledAt: true },
  });
});

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
  const validated = await validateSessionAndConsent();
  if (!validated.ok) {
    if (validated.reason === "consent") {
      redirect(
        `/oauth-consent?callbackUrl=${encodeURIComponent(safeCallback)}`
      );
    }
    redirect(`/signin?callbackUrl=${encodeURIComponent(safeCallback)}`);
  }

  return validated.user;
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
    const partner = await loadPartnerGateProfile(user.id);
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
