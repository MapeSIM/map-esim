import Link from "next/link";
import AuthCard from "@/app/components/auth/AuthCard";
import OtpVerifyForm from "@/app/components/auth/OtpVerifyForm";
import {
  resendResetOtpAction,
  verifyResetOtpAction,
} from "@/app/lib/auth/actions";
import { normalizeEmail } from "@/app/lib/auth/email";

export default async function VerifyResetCodePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = normalizeEmail(params.email || "");

  return (
    <AuthCard
      title="Enter reset code"
      subtitle="If an account exists for this email, a verification code has been sent. The code expires in 10 minutes."
    >
      {!email ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]">
            Start from the forgot password page to request a code.
          </p>
          <p className="text-center text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Forgot password
            </Link>
          </p>
        </div>
      ) : (
        <>
          <OtpVerifyForm
            email={email}
            verifyAction={verifyResetOtpAction}
            resendAction={resendResetOtpAction}
            submitLabel="Continue"
          />
          <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
            <Link
              href="/forgot-password"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              Use a different email
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
