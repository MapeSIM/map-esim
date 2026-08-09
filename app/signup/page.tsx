import AuthCard from "@/app/components/auth/AuthCard";
import AuthDivider from "@/app/components/auth/AuthDivider";
import { AuthFooterLinks, AuthForm } from "@/app/components/auth/AuthForm";
import GoogleSignInButton from "@/app/components/auth/GoogleSignInButton";
import { signupAction } from "@/app/lib/auth/actions";

export default function SignupPage() {
  const googleEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );

  return (
    <AuthCard
      title="Create your account"
      subtitle="Save your purchases and manage eSIMs in one place. Sign in is required for checkout."
    >
      {googleEnabled ? (
        <>
          <GoogleSignInButton callbackUrl="/account" />
          <AuthDivider />
        </>
      ) : null}

      <AuthForm
        action={signupAction}
        submitLabel="Create account"
        legalConsent
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
