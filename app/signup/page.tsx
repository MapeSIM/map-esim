import AuthCard from "@/app/components/auth/AuthCard";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import { signupAction } from "@/app/lib/auth/actions";

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Save your purchases and manage eSIMs in one place. Guest checkout still works without an account."
    >
      <AuthForm
        action={signupAction}
        submitLabel="Create account"
        fields={[
          {
            name: "name",
            label: "Full name",
            autoComplete: "name",
          },
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
            autoComplete: "new-password",
            showRequirements: true,
            emailFieldName: "email",
          },
          {
            name: "confirmPassword",
            label: "Confirm password",
            type: "password",
            autoComplete: "new-password",
            matchWith: "password",
          },
        ]}
        extras={
          <label className="flex items-start gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              name="terms"
              className="mt-1 h-4 w-4 rounded border-[var(--border-strong)]"
              required
            />
            <span>
              I agree to the MAP eSIM terms of service and privacy policy.
            </span>
          </label>
        }
        footer={
          <AuthFooterLinks
            links={[
              { href: "/signin", label: "Already have an account? Sign in" },
            ]}
          />
        }
      />
    </AuthCard>
  );
}
