import { Suspense } from "react";
import { redirect } from "next/navigation";
import OAuthConsentForm from "@/app/components/auth/OAuthConsentForm";
import AuthCard from "@/app/components/auth/AuthCard";
import { auth } from "@/auth";
import {
  deriveNeedsLegalConsent,
  loadConsentGateUser,
  resolveAuthMethod,
} from "@/app/lib/auth/legalConsentGate";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import { readRequestOrigin } from "@/app/lib/auth/requestOrigin";

export const dynamic = "force-dynamic";

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  if (session.user.role !== "CUSTOMER") {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/account");
  }

  const dbUser = await loadConsentGateUser(session.user.id);
  if (!dbUser?.emailVerifiedAt || dbUser.deletedAt) {
    redirect("/signin");
  }

  const authMethod = resolveAuthMethod({
    tokenAuthMethod: session.user.authMethod,
    passwordHash: dbUser.passwordHash,
    hasGoogleAccount: dbUser.hasGoogleAccount,
  });

  const rawCallback = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  const requestOrigin = await readRequestOrigin();
  const next = safeCallbackPath(rawCallback, "/", { requestOrigin });

  // Already consented (or not a Google consent subject) → leave this page.
  if (!deriveNeedsLegalConsent(authMethod, dbUser)) {
    redirect(next);
  }

  return (
    <Suspense
      fallback={
        <AuthCard title="Almost there" subtitle="Loading…">
          <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
        </AuthCard>
      }
    >
      <OAuthConsentForm />
    </Suspense>
  );
}
