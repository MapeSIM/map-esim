import { AuthForm } from "@/app/components/auth/AuthForm";
import DeleteAccountSection from "@/app/components/auth/DeleteAccountSection";
import { changePasswordAction } from "@/app/lib/auth/actions";
import { requireSession } from "@/app/lib/auth/session";

export default async function AccountSecurityPage() {
  const user = await requireSession();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Update your password or permanently delete your customer account.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Change password</h2>
        <AuthForm
          action={changePasswordAction}
          submitLabel="Update password"
          emailHint={user.email}
          fields={[
            {
              name: "currentPassword",
              label: "Current password",
              type: "password",
              autoComplete: "current-password",
            },
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
        />
      </section>

      <DeleteAccountSection isCustomer={user.role === "CUSTOMER"} />
    </div>
  );
}
