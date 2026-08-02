import AuthCard from "@/app/components/auth/AuthCard";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import { resetPasswordAction } from "@/app/lib/auth/actions";
import { getResetAuthorizationUser } from "@/app/lib/auth/resetAuth";

export default async function ResetPasswordPage() {
  const authUser = await getResetAuthorizationUser();

  return (
    <AuthCard
      title="Reset password"
      subtitle="Choose a strong new password for your MAP eSIM account."
    >
      {!authUser ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]">
            Your reset session is missing or expired. Request a new verification
            code to continue.
          </p>
          <AuthFooterLinks
            links={[{ href: "/forgot-password", label: "Forgot password" }]}
          />
        </div>
      ) : (
        <AuthForm
          action={resetPasswordAction}
          submitLabel="Update password"
          emailHint={authUser.email}
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
              label: "Confirm new password",
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
