"use server";

import { redirect } from "next/navigation";
import { auth, unstable_update } from "@/auth";
import {
  GOOGLE_AUTH_METHOD,
  googleOauthConsentRecord,
  isOauthConsentAccepted,
  LEGAL_CONSENT_ERROR,
} from "@/app/lib/auth/googleOAuth";
import {
  deriveNeedsLegalConsent,
  loadConsentGateUser,
  resolveAuthMethod,
} from "@/app/lib/auth/legalConsentGate";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import { readRequestOrigin } from "@/app/lib/auth/requestOrigin";
import type { AuthActionState } from "@/app/lib/auth/actions";

export type OAuthConsentActionState = AuthActionState;

/**
 * Records Terms/Privacy acknowledgement for Google CUSTOMER first login.
 * Consent is never accepted via query params — only authenticated POST.
 */
export async function acceptGoogleOauthConsentAction(
  _prev: OAuthConsentActionState,
  formData: FormData
): Promise<OAuthConsentActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  const userId = session.user.id;

  if (session.user.role !== "CUSTOMER") {
    return {
      ok: false,
      error: "Only customer accounts use this consent step.",
    };
  }

  if (!isOauthConsentAccepted(formData.get("terms"))) {
    return {
      ok: false,
      fieldErrors: { terms: LEGAL_CONSENT_ERROR },
      error: LEGAL_CONSENT_ERROR,
    };
  }

  const dbUser = await loadConsentGateUser(userId);
  if (!dbUser || dbUser.deletedAt || dbUser.role !== "CUSTOMER") {
    return { ok: false, error: "Unable to save consent." };
  }

  const authMethod = resolveAuthMethod({
    tokenAuthMethod: session.user.authMethod,
    passwordHash: dbUser.passwordHash,
    hasGoogleAccount: dbUser.hasGoogleAccount,
  });

  if (authMethod !== GOOGLE_AUTH_METHOD) {
    return {
      ok: false,
      error: "This consent step is only for Google sign-in accounts.",
    };
  }

  // Idempotent — write when consent incomplete (timestamps or versions).
  if (deriveNeedsLegalConsent(authMethod, dbUser)) {
    const consent = googleOauthConsentRecord();
    await prisma.user.update({
      where: { id: userId },
      data: consent,
    });

    await writeAuditLog({
      actorUserId: userId,
      action: "user.google_oauth_consent_accepted",
      targetType: "User",
      targetId: userId,
      metadata: {
        source: consent.legalConsentSource,
        termsVersion: consent.termsVersion,
        privacyVersion: consent.privacyVersion,
      },
    });
  }

  // Refresh JWT from DB so needsLegalConsent becomes false without re-login.
  await unstable_update({
    user: {
      needsLegalConsent: false,
      authMethod: GOOGLE_AUTH_METHOD,
    },
  });

  const rawCallback = String(formData.get("callbackUrl") || "");
  const requestOrigin = await readRequestOrigin();
  const next = safeCallbackPath(rawCallback, "/", { requestOrigin });
  redirect(next);
}
