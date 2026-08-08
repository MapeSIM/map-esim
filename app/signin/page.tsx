import AuthCard from "@/app/components/auth/AuthCard";
import AuthDivider from "@/app/components/auth/AuthDivider";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import GoogleSignInButton from "@/app/components/auth/GoogleSignInButton";
import { signinAction } from "@/app/lib/auth/actions";
import {
  ADMIN_SESSION_ENDED_MESSAGE,
  consumeAdminSessionEndedNotice,
} from "@/app/lib/auth/adminSession";
import {
  mapOAuthErrorParam,
  publicOAuthErrorMessage,
} from "@/app/lib/auth/googleOAuth";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import { readRequestOrigin } from "@/app/lib/auth/requestOrigin";

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    verified?: string;
    reset?: string;
    deleted?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const requestOrigin = await readRequestOrigin();
  // Auth.js middleware often sets an absolute same-site callbackUrl.
  const callbackUrl = safeCallbackPath(params.callbackUrl, "", {
    requestOrigin,
  });
  const verified = params.verified === "1";
  const reset = params.reset === "1";
  const deleted = params.deleted === "1";
  const adminSessionEnded = await consumeAdminSessionEndedNotice();
  const oauthError = publicOAuthErrorMessage(
    mapOAuthErrorParam(params.error)
  );
  const googleEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );

  return (
    <AuthCard
      title="Sign in"
      subtitle="Access your MAP eSIM account. Installation details still require your secure order link."
    >
      {deleted ? (
        <p className="mb-4 rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-3 py-2 text-sm text-[var(--heading)]">
          Your MAP eSIM account has been deleted.
        </p>
      ) : null}
      {adminSessionEnded ? (
        <p
          className="mb-4 rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-3 py-2 text-sm text-[var(--heading)]"
          role="status"
        >
          {ADMIN_SESSION_ENDED_MESSAGE}
        </p>
      ) : null}
      {verified ? (
        <p className="mb-4 rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-3 py-2 text-sm text-[var(--heading)]">
          Email verified. You can sign in now.
        </p>
      ) : null}
      {reset ? (
        <p className="mb-4 rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-3 py-2 text-sm text-[var(--heading)]">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      {oauthError ? (
        <p
          className="mb-4 rounded-xl border border-[var(--danger-text)]/30 bg-[var(--danger-text)]/10 px-3 py-2 text-sm text-[var(--danger-text)]"
          role="alert"
        >
          {oauthError}
        </p>
      ) : null}

      {googleEnabled ? (
        <>
          <GoogleSignInButton callbackUrl={callbackUrl || "/"} />
          <AuthDivider />
        </>
      ) : null}

      <AuthForm
        action={signinAction}
        submitLabel="Sign in"
        hiddenFields={callbackUrl ? { callbackUrl } : undefined}
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
        extras={
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              name="remember"
              className="h-4 w-4 rounded border-[var(--border-strong)]"
            />
            <span>Remember me on this device</span>
          </label>
        }
        footer={
          <AuthFooterLinks
            links={[
              { href: "/signup", label: "Create account" },
              { href: "/forgot-password", label: "Forgot password?" },
            ]}
          />
        }
      />
    </AuthCard>
  );
}
