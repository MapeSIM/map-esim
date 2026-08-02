/**
 * Controlled QA for customer account soft-deletion.
 * Uses a disposable customer only — never touches admin or real customers.
 * Does not send live email (OTP path is tested at the OTP layer; mail send is skipped).
 */
import { loadEnvConfig } from "@next/env";
import { OtpPurpose, PrismaClient, Role } from "@prisma/client";
import {
  deletedAccountEmail,
  softDeleteCustomerAccount,
} from "../app/lib/auth/accountDeletion";
import {
  generateOtpCode,
  hashOtpCode,
  issueEmailOtp,
  verifyEmailOtp,
} from "../app/lib/auth/otp";
import { hashPassword, verifyPassword } from "../app/lib/auth/password";

loadEnvConfig(process.cwd());

async function main() {
  const p = new PrismaClient();
  const results: Array<{ n: string; ok: boolean; detail?: string }> = [];
  const pass = (n: string, ok: boolean, detail = "") => {
    results.push({ n, ok, detail });
    console.log(ok ? "PASS" : "FAIL", n, detail);
  };

  const stamp = Date.now();
  const email = `delete.qa+${stamp}@example.com`;
  const password = "DeleteQa12!";
  const providerOrderId = `qa-del-${stamp}`;

  const user = await p.user.create({
    data: {
      name: "Delete QA",
      email,
      passwordHash: await hashPassword(password),
      role: Role.CUSTOMER,
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true },
  });

  await p.order.create({
    data: {
      providerOrderId,
      userId: user.id,
      customerEmail: email,
      offerId: "qa-offer",
      destination: "QA",
      planName: "QA Plan",
      status: "COMPLETED",
    },
  });

  // ADMIN cannot be soft-deleted via this helper.
  const adminProbe = await p.user.create({
    data: {
      name: "Temp Admin Probe",
      email: `delete.admin.probe+${stamp}@example.com`,
      passwordHash: await hashPassword(password),
      role: Role.ADMIN,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  const adminReject = await softDeleteCustomerAccount({
    userId: adminProbe.id,
  });
  pass("admin_soft_delete_rejected", adminReject.ok === false);
  const adminStill = await p.user.findUnique({
    where: { id: adminProbe.id },
    select: { deletedAt: true, email: true },
  });
  pass("admin_untouched", !adminStill?.deletedAt);

  // Wrong-purpose OTP must not verify for deletion.
  const signupOtp = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.EMAIL_VERIFICATION,
    force: true,
  });
  pass("issue_signup_otp", signupOtp.ok);
  if (signupOtp.ok) {
    const wrongPurpose = await verifyEmailOtp({
      userId: user.id,
      purpose: OtpPurpose.ACCOUNT_DELETION,
      code: signupOtp.code,
    });
    pass("wrong_purpose_rejected", wrongPurpose.ok === false);
  }

  const issued = await issueEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.ACCOUNT_DELETION,
    force: true,
  });
  pass("issue_deletion_otp", issued.ok);
  if (!issued.ok) throw new Error("deletion otp issue failed");

  const invalid = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.ACCOUNT_DELETION,
    code: "000000",
  });
  pass("invalid_otp_rejected", invalid.ok === false && invalid.reason === "invalid");

  const good = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.ACCOUNT_DELETION,
    code: issued.code,
  });
  pass("valid_otp_accepted", good.ok);

  const reused = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.ACCOUNT_DELETION,
    code: issued.code,
  });
  pass("reused_otp_rejected", reused.ok === false && reused.reason === "used");

  // Expired OTP
  const expiredCode = generateOtpCode();
  await p.emailOtp.create({
    data: {
      userId: user.id,
      purpose: OtpPurpose.ACCOUNT_DELETION,
      codeHash: hashOtpCode(expiredCode),
      expiresAt: new Date(Date.now() - 1000),
      lastSentAt: new Date(Date.now() - 60_000),
    },
  });
  const expired = await verifyEmailOtp({
    userId: user.id,
    purpose: OtpPurpose.ACCOUNT_DELETION,
    code: expiredCode,
  });
  pass("expired_otp_rejected", expired.ok === false && expired.reason === "expired");

  const soft = await softDeleteCustomerAccount({ userId: user.id });
  pass("soft_delete_ok", soft.ok);

  const after = await p.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      name: true,
      deletedAt: true,
      emailVerifiedAt: true,
      passwordHash: true,
      credentialsChangedAt: true,
    },
  });
  pass("deletedAt_set", Boolean(after?.deletedAt));
  pass("email_anonymized", after?.email === deletedAccountEmail(user.id));
  pass("name_anonymized", after?.name === "Deleted User");
  pass("email_unverified", after?.emailVerifiedAt === null);
  pass(
    "password_disabled",
    Boolean(after?.passwordHash) &&
      !(await verifyPassword(password, after!.passwordHash))
  );

  const sessions = await p.session.count({ where: { userId: user.id } });
  pass("sessions_revoked", sessions === 0);

  const activeOtps = await p.emailOtp.count({
    where: { userId: user.id, usedAt: null },
  });
  pass("otps_invalidated", activeOtps === 0);

  const order = await p.order.findUnique({
    where: { providerOrderId },
    select: {
      providerOrderId: true,
      userId: true,
      customerEmail: true,
      offerId: true,
    },
  });
  pass("order_preserved", order?.providerOrderId === providerOrderId);
  pass("order_unlinked", order?.userId === null);
  pass("order_fields_intact", order?.offerId === "qa-offer");

  // Original email can register again (no unique collision).
  const clash = await p.user.findUnique({ where: { email } });
  pass("old_email_free", clash === null);

  const rereg = await p.user.create({
    data: {
      name: "Re-register QA",
      email,
      passwordHash: await hashPassword("Reregister12!"),
      role: Role.CUSTOMER,
      emailVerifiedAt: null,
    },
    select: { id: true },
  });
  pass("old_email_reregister", Boolean(rereg.id));

  // Cleanup disposable rows only.
  await p.order.delete({ where: { providerOrderId } });
  await p.emailOtp.deleteMany({
    where: { userId: { in: [user.id, rereg.id, adminProbe.id] } },
  });
  await p.user.deleteMany({
    where: { id: { in: [user.id, rereg.id, adminProbe.id] } },
  });
  await p.$disconnect();

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log("FAILED_COUNT=" + failed.length);
    process.exit(1);
  }
  console.log("ALL_QA_PASSED=" + results.length);
}

main().catch((error) => {
  console.error(
    "QA_ERROR",
    String(error instanceof Error ? error.message : error).slice(0, 300)
  );
  process.exit(1);
});
