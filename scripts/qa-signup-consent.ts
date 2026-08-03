/**
 * Non-destructive QA for signup legal consent.
 * Does not send live email. Uses a disposable customer only when testing storage.
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  isSignupConsentAccepted,
  LEGAL_CONSENT_ERROR,
  signupConsentRecord,
} from "../app/lib/auth/signupConsent";
import {
  LEGAL_CONSENT_SOURCE_SIGNUP,
  LEGAL_POLICY_VERSION,
} from "../app/lib/legal";

loadEnvConfig(process.cwd());

async function main() {
  const p = new PrismaClient();
  const results: Array<{ n: string; ok: boolean }> = [];
  const pass = (n: string, ok: boolean) => {
    results.push({ n, ok });
    console.log(ok ? "PASS" : "FAIL", n);
  };

  pass("consent_false_rejected", isSignupConsentAccepted(false) === false);
  pass("consent_missing_rejected", isSignupConsentAccepted(null) === false);
  pass("consent_on_accepted", isSignupConsentAccepted("on") === true);
  pass(
    "consent_error_copy",
    LEGAL_CONSENT_ERROR ===
      "You must agree to the Terms & Conditions and acknowledge the Privacy Policy."
  );

  const stamp = Date.now();
  const email = `consent.qa+${stamp}@example.com`;

  // Unchecked path must not create a user (simulate pre-create gate).
  const wouldCreateWithoutConsent = isSignupConsentAccepted(undefined);
  pass("no_user_without_consent_gate", wouldCreateWithoutConsent === false);
  const before = await p.user.count({ where: { email } });
  pass("disposable_email_absent", before === 0);

  // Checked path: store consent timestamps/versions without sending OTP.
  const consent = signupConsentRecord();
  const user = await p.user.create({
    data: {
      name: "Consent QA",
      email,
      passwordHash: await hashPassword("ConsentQa12!"),
      role: Role.CUSTOMER,
      emailVerifiedAt: null,
      ...consent,
    },
    select: {
      id: true,
      termsAcceptedAt: true,
      termsVersion: true,
      privacyAcknowledgedAt: true,
      privacyVersion: true,
      legalConsentSource: true,
    },
  });

  pass("timestamps_stored", Boolean(user.termsAcceptedAt && user.privacyAcknowledgedAt));
  pass("terms_version", user.termsVersion === LEGAL_POLICY_VERSION);
  pass("privacy_version", user.privacyVersion === LEGAL_POLICY_VERSION);
  pass("consent_source_signup", user.legalConsentSource === LEGAL_CONSENT_SOURCE_SIGNUP);

  // Legacy / existing-style user (null consent) remains representable.
  const legacyEmail = `consent.legacy+${stamp}@example.com`;
  const legacy = await p.user.create({
    data: {
      name: "Legacy QA",
      email: legacyEmail,
      passwordHash: await hashPassword("LegacyQa12!"),
      role: Role.CUSTOMER,
      emailVerifiedAt: new Date(),
    },
    select: {
      termsAcceptedAt: true,
      legalConsentSource: true,
    },
  });
  pass("legacy_consent_null", legacy.termsAcceptedAt === null);
  pass("legacy_source_null", legacy.legalConsentSource === null);

  const legacyRow = await p.user.findUnique({
    where: { email: legacyEmail },
    select: { id: true },
  });
  await p.user.deleteMany({
    where: {
      id: { in: [user.id, ...(legacyRow ? [legacyRow.id] : [])] },
    },
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
