import { OtpPurpose, PrismaClient } from "@prisma/client";
import {
  generateOtpCode,
  hashOtpCode,
  issueEmailOtp,
  OTP_MAX_ATTEMPTS,
  verifyEmailOtp,
} from "../app/lib/auth/otp";
import { hashPassword, passwordSchema } from "../app/lib/auth/password";
import {
  renderOtpEmailHtml,
  renderOtpEmailText,
} from "../app/lib/email/otpTemplate";

async function main() {
  const p = new PrismaClient();
  const email = `otp.qa+${Date.now()}@example.com`;
  const results: Array<{ n: string; ok: boolean; detail?: string }> = [];
  const pass = (n: string, ok: boolean, detail = "") => {
    results.push({ n, ok, detail });
    console.log(ok ? "PASS" : "FAIL", n, detail);
  };

  const code = generateOtpCode();
  pass("otp_format", /^[0-9]{6}$/.test(code));
  pass("hash_deterministic", hashOtpCode(code) === hashOtpCode(code));
  pass("hash_not_plain", !hashOtpCode(code).includes(code));

  const html = renderOtpEmailHtml({
    kind: "signup",
    code: "123456",
    recipientEmail: email,
  });
  pass("email_has_code", html.includes("123456"));
  pass("email_has_expiry", html.includes("expires in 10 minutes"));
  pass("email_table", html.includes("<table"));
  const text = renderOtpEmailText({
    kind: "password_reset",
    code: "654321",
    recipientEmail: email,
  });
  pass("text_safe", !text.toLowerCase().includes("passwordhash"));

  const user = await p.user.create({
    data: {
      name: "OTP QA",
      email,
      passwordHash: await hashPassword("OldPassword12"),
      role: "CUSTOMER",
      emailVerifiedAt: null,
    },
    select: { id: true },
  });

  const issued = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    force: true,
  });
  pass("issue_otp", issued.ok === true);
  if (!issued.ok) throw new Error("issue failed");
  const plain = issued.code;

  const bad = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    code: "000000",
  });
  pass("invalid_otp", bad.ok === false && bad.reason === "invalid");

  const wrongPurpose = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.PASSWORD_RESET,
    code: plain,
  });
  pass("mismatched_purpose", wrongPurpose.ok === false);

  const good = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    code: plain,
  });
  pass("valid_otp", good.ok === true);

  const reused = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    code: plain,
  });
  pass("reused_otp", reused.ok === false);

  const issued2 = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    force: true,
  });
  if (!issued2.ok) throw new Error("issue2 failed");
  for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
    await verifyEmailOtp({
      userId: user.id,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
      code: "111111",
    });
  }
  const locked = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    code: issued2.code,
  });
  pass("max_attempts_lock", locked.ok === false && locked.reason === "locked");

  const issued3 = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    force: true,
  });
  pass("force_reissue", issued3.ok === true);
  const cool = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
  });
  pass("resend_cooldown", cool.ok === false && cool.reason === "cooldown");

  const issued4 = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    force: true,
  });
  if (!issued4.ok) throw new Error("issue4");
  await p.emailOtp.updateMany({
    where: {
      userId: user.id,
      purpose: OtpPurpose.EMAIL_VERIFICATION,
      usedAt: null,
    },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    code: issued4.code,
  });
  pass("expired_otp", expired.ok === false && expired.reason === "expired");

  pass("password_policy_strong", passwordSchema.safeParse("NewPassword12!").success);
  pass("password_policy_weak", passwordSchema.safeParse("NewPassword12").success === false);

  await p.emailOtp.deleteMany({ where: { userId: user.id } });
  await p.user.delete({ where: { id: user.id } });
  await p.$disconnect();

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log("FAILED_COUNT=" + failed.length);
    process.exit(1);
  }
  console.log("ALL_QA_PASSED=" + results.length);
}

main().catch((e) => {
  console.error("QA_ERROR", String(e instanceof Error ? e.message : e).slice(0, 300));
  process.exit(1);
});
