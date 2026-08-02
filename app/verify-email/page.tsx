import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import OtpVerifyForm from "@/app/components/auth/OtpVerifyForm";
import {
  resendSignupOtpAction,
  verifyEmailOtpAction,
} from "@/app/lib/auth/actions";
import { normalizeEmail } from "@/app/lib/auth/email";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = normalizeEmail(params.email || "");

  return (
    <AuthCard
      title="Verify your email"
      subtitle="Enter the 6-digit code we sent to your inbox. The code expires in 10 minutes."
    >
      {!email ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]">
            Missing email. Start from sign up or sign in again.
          </p>
          <p className="text-center text-sm text-[var(--text-muted)]">
            <Link
              href="/signup"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Create account
            </Link>
            {" · "}
            <Link
              href="/signin"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      ) : (
        <>
          <OtpVerifyForm
            email={email}
            verifyAction={verifyEmailOtpAction}
            resendAction={resendSignupOtpAction}
          />
          <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
            <Link
              href="/signin"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
