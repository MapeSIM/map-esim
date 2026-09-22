import AuthCard from "@/app/components/auth/AuthCard";
import AuthDivider from "@/app/components/auth/AuthDivider";
import {
  AuthFooterLinks,
  AuthForm,
  type AuthField,
} from "@/app/components/auth/AuthForm";
import GoogleSignInButton from "@/app/components/auth/GoogleSignInButton";
import ReferralRefCookieBootstrap from "@/app/components/auth/ReferralRefCookieBootstrap";
import { signupAction } from "@/app/lib/auth/actions";
import { normalizeReferralCode } from "@/app/lib/referrals/referralCode";
import { getReferralProgramSettings } from "@/app/lib/referrals/referralProgramConfig";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const googleEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  );
  const params = await searchParams;
  const referralProgramEnabled = (await getReferralProgramSettings()).enabled;
  const referralCode = referralProgramEnabled
    ? normalizeReferralCode(params.ref)
    : null;

  const fields: AuthField[] = [
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
  ];

  if (referralProgramEnabled) {
    fields.push({
      name: "referralCode",
      label: "Referral code",
      autoComplete: "off",
      required: false,
      defaultValue: referralCode || undefined,
      hint: "If a friend shared a code with you, enter it here. You can leave this blank.",
      collapsible: {
        summary: "Have a referral code?",
        defaultOpen: Boolean(referralCode),
      },
    });
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Save your purchases and manage eSIMs in one place. Sign in is required for checkout."
    >
      {referralProgramEnabled ? (
        <ReferralRefCookieBootstrap code={referralCode} />
      ) : null}
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
        fields={fields}
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
