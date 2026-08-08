/**
 * Offline QA for simplified customer password policy.
 * Does not touch DB, SMTP, or send credentials.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAdminPasswordValid,
  isPasswordValid,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENT_MESSAGE,
  passwordSchema,
  validateAdminPassword,
  validatePassword,
} from "../app/lib/auth/password";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(PASSWORD_MIN_LENGTH, 6);
  assert.equal(
    PASSWORD_REQUIREMENT_MESSAGE,
    "Password must be at least 6 characters."
  );

  assert.equal(isPasswordValid("abcdef"), true);
  assert.equal(isPasswordValid("123456"), true);
  assert.equal(isPasswordValid("!!!!!!"), true);
  assert.equal(isPasswordValid("abcde"), false);
  assert.equal(isPasswordValid(""), false);
  assert.equal(validatePassword("secret").ok, true);
  assert.equal(validatePassword("short").ok, false);
  assert.equal(passwordSchema.safeParse("abcdef").success, true);
  assert.equal(passwordSchema.safeParse("NewPassword12").success, true);
  assert.equal(passwordSchema.safeParse("abcde").success, false);

  // Admin bootstrap/reset policy remains strong.
  assert.equal(isAdminPasswordValid("NewPassword12!", "admin@mapesim.com"), true);
  assert.equal(isAdminPasswordValid("NewPassword12", "admin@mapesim.com"), false);
  assert.equal(isAdminPasswordValid("abcdef", "admin@mapesim.com"), false);
  assert.equal(validateAdminPassword("abcdef").ok, false);

  const passwordLib = read("app/lib/auth/password.ts");
  const requirementsUi = read("app/components/auth/PasswordRequirements.tsx");
  const actions = read("app/lib/auth/actions.ts");
  const seed = read("scripts/seed-admin.ts");
  const guest = read("app/lib/vesim/guestCheckoutGate.ts");
  const google = read("app/lib/auth/googleOAuth.ts");

  assert.match(passwordLib, /PASSWORD_MIN_LENGTH = 6/);
  assert.doesNotMatch(passwordLib, /One uppercase letter/);
  assert.match(requirementsUi, /PASSWORD_REQUIREMENT_MESSAGE/);
  assert.doesNotMatch(requirementsUi, /uppercase|lowercase|special character/i);
  assert.match(actions, /PASSWORD_REQUIREMENT_MESSAGE/);
  assert.match(actions, /validateAdminPassword/);
  assert.match(actions, /Role\.ADMIN/);
  assert.match(seed, /isAdminPasswordValid/);
  assert.doesNotMatch(seed, /isPasswordValid\(/);
  assert.match(guest, /ENABLE_GUEST_VESIM_CHECKOUT === "true"/);
  assert.match(google, /GOOGLE_AUTH_METHOD|Google/);

  console.log("PASS customer_min_length_6");
  console.log("PASS complexity_removed_for_customers");
  console.log("PASS admin_strong_policy_preserved");
  console.log("PASS signup_reset_change_wiring");
  console.log("PASS google_guest_untouched_surface");
  console.log("ALL_QA_PASSED=password-policy");
}

main();
