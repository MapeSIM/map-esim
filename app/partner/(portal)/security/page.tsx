import { AuthForm } from "@/app/components/auth/AuthForm";
import { changePasswordAction } from "@/app/lib/auth/actions";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PartnerSecurityPage() {
  const user = await requireRole("PARTNER");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Password & Security</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Update the password for this Partner account.
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
    </div>
  );
}
