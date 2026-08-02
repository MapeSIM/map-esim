import AuthCard from "@/app/components/auth/AuthCard";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import { signinAction } from "@/app/lib/auth/actions";
import { safeCallbackPath } from "@/app/lib/auth/redirects";

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    verified?: string;
    reset?: string;
    deleted?: string;
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackPath(params.callbackUrl, "");
  const verified = params.verified === "1";
  const reset = params.reset === "1";
  const deleted = params.deleted === "1";

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
