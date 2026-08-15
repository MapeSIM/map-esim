import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/app/components/auth/AuthCard";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import { completePartnerPasswordSetupAction } from "@/app/lib/partner/partnerInviteActions";
import {
  PARTNER_INVITE_INVALID_MESSAGE,
  getPartnerInviteSetupUser,
} from "@/app/lib/partner/partnerInvite";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up Partner password",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  other: {
    referrer: "no-referrer",
  },
};

export default async function PartnerSetupPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const rawToken = typeof params.token === "string" ? params.token.trim() : "";

  // Backward compat: never write cookies here — hand off to Route Handler.
  if (rawToken) {
    redirect(
      `/partner/setup-password/exchange?token=${encodeURIComponent(rawToken)}`
    );
  }

  const setupUser = await getPartnerInviteSetupUser();

  return (
    <AuthCard
      title="Create your Partner password"
      subtitle="Choose a strong password for your MAP eSIM Partner account."
    >
      {!setupUser ? (
        <div className="space-y-4">
          <p
            className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]"
            role="alert"
          >
            {PARTNER_INVITE_INVALID_MESSAGE}
          </p>
          <AuthFooterLinks
            links={[{ href: "/signin", label: "Back to sign in" }]}
          />
        </div>
      ) : (
        <AuthForm
          action={completePartnerPasswordSetupAction}
          submitLabel="Create password"
          emailHint={setupUser.email}
          fields={[
            {
              name: "password",
              label: "New password",
              type: "password",
              autoComplete: "new-password",
              showRequirements: true,
            },
            {
              name: "confirmPassword",
              label: "Confirm password",
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
