import type { Metadata } from "next";
import AuthCard from "@/app/components/auth/AuthCard";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import { completeAdminPasswordSetupAction } from "@/app/lib/admin/adminInviteSetupActions";
import {
  ADMIN_INVITE_INVALID_MESSAGE,
  peekAdminInviteSetupToken,
} from "@/app/lib/admin/adminInviteSetup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create administrator password",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  other: {
    referrer: "no-referrer",
  },
};

export default async function AdminSetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const rawToken = typeof params.token === "string" ? params.token.trim() : "";
  const peeked = rawToken
    ? await peekAdminInviteSetupToken(rawToken)
    : { ok: false as const, error: ADMIN_INVITE_INVALID_MESSAGE };

  return (
    <AuthCard
      title="Create your administrator password"
      subtitle="Choose a strong password for your MAP eSIM administrator account. Admin passwords must be 10–128 characters and include upper, lower, number, and special character."
    >
      {!peeked.ok ? (
        <div className="space-y-4">
          <p
            className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]"
            role="alert"
          >
            {ADMIN_INVITE_INVALID_MESSAGE}
          </p>
          <AuthFooterLinks
            links={[{ href: "/signin", label: "Back to sign in" }]}
          />
        </div>
      ) : (
        <AuthForm
          action={completeAdminPasswordSetupAction}
          submitLabel="Create password"
          emailHint={peeked.email}
          hiddenFields={{ token: rawToken }}
          fields={[
            {
              name: "password",
              label: "Create New Password",
              type: "password",
              autoComplete: "new-password",
            },
            {
              name: "confirmPassword",
              label: "Confirm Password",
              type: "password",
              autoComplete: "new-password",
              matchWith: "password",
            },
          ]}
          footer={
            <AuthFooterLinks
              links={[{ href: "/signin", label: "Back to sign in" }]}
            />
          }
        />
      )}
    </AuthCard>
  );
}
