import AuthCard from "@/app/components/auth/AuthCard";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import { forgotPasswordAction } from "@/app/lib/auth/actions";

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      subtitle="Enter your email. If an account exists for this email, a verification code has been sent."
    >
      <AuthForm
        action={forgotPasswordAction}
        submitLabel="Send verification code"
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
          },
        ]}
        footer={
          <AuthFooterLinks links={[{ href: "/signin", label: "Back to sign in" }]} />
        }
      />
    </AuthCard>
  );
}
