/**
 * Offline QA: public contact-form email delivery after the support-inbox fix.
 * Does not send SMTP, mutate DB, or change partnership flow.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_SUPPORT_EMAIL } from "../app/lib/brand";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertNoSecrets(content: string) {
  assert.doesNotMatch(content, /SMTP_.*PASSWORD|DATABASE_URL|VESIM_PASSWORD/);
}

function main() {
  const action = read("app/lib/contact/submitContactForm.ts");
  const sender = read("app/lib/email/sendContactFormEmail.ts");
  const form = read("app/components/contact/ContactForm.tsx");
  const page = read("app/contact/page.tsx");
  const pkg = read("package.json");
  const partnershipSender = read("app/lib/email/sendPartnershipFormEmail.ts");
  const partnershipAction = read("app/lib/partnerships/submitPartnershipForm.ts");

  console.log("1) Normal submission reaches SMTP send");
  assert.match(page, /ContactForm/);
  assert.match(form, /submitContactFormAction/);
  assert.match(action, /"use server"/);
  assert.match(action, /await sendContactFormEmail\(\{/);
  assert.match(action, /customerName:\s*name/);
  assert.match(action, /customerEmail:\s*email/);
  assert.match(action, /subject,/);
  assert.match(action, /message,/);
  const actionFn = action.slice(
    action.indexOf("export async function submitContactFormAction")
  );
  const sendCall = actionFn.indexOf("await sendContactFormEmail");
  const honeypotReturn = actionFn.indexOf('return { status: "success" }');
  assert.ok(honeypotReturn >= 0 && sendCall > honeypotReturn);
  assert.match(action, /isValidEmail\(email\)/);
  assert.match(action, /assertContactRateLimit/);
  assert.match(action, /assertContactNotDuplicate/);
  console.log("   ok");

  console.log("2) Honeypot empty for humans; autofill-safe name");
  assert.match(form, /name=["']fax_number["']/);
  assert.match(form, /autoComplete=["']off["']/);
  assert.doesNotMatch(form, /name=["']company["']/);
  assert.match(action, /readField\(formData,\s*["']fax_number["']\)/);
  assert.match(
    action,
    /const honeypot = readField\(formData,\s*["']fax_number["']\)[\s\S]*if \(honeypot\) \{[\s\S]*return \{ status: "success" \}/
  );
  assert.doesNotMatch(action, /readField\(formData,\s*["']company["']\)/);
  console.log("   ok");

  console.log("3) Reply-To is the customer email");
  assert.match(sender, /const replyTo = options\.customerEmail\.trim\(\)\.toLowerCase\(\)/);
  assert.match(sender, /isValidEmail\(replyTo\)/);
  assert.match(
    sender,
    /await transporter\.sendMail\(\{[\s\S]*replyTo,/
  );
  assert.doesNotMatch(
    sender,
    /replyTo:\s*config\.(replyTo|from)|replyTo:\s*SUPPORT_REPLY_TO/
  );
  console.log("   ok");

  console.log("4) Support inbox delivery (same recipient as partnership)");
  assert.equal(BRAND_SUPPORT_EMAIL, "support@mapesim.com");
  assert.match(sender, /getEmailConfig\(["']support["']\)/);
  assert.match(sender, /getChannelTransporter\(["']support["']\)/);
  assert.match(sender, /const to = BRAND_SUPPORT_EMAIL\.trim\(\)\.toLowerCase\(\)/);
  assert.match(
    sender,
    /await transporter\.sendMail\(\{[\s\S]*\bto,/
  );
  assert.doesNotMatch(sender, /EMAIL_CHANNELS\.orders|orders@mapesim\.com/);
  assert.doesNotMatch(sender, /envelope:\s*\{/);
  assert.doesNotMatch(sender, /sendChannelMail/);
  assert.match(partnershipSender, /const to = BRAND_SUPPORT_EMAIL\.trim\(\)\.toLowerCase\(\)/);
  assert.doesNotMatch(partnershipSender, /envelope:\s*\{/);
  console.log("   ok");

  console.log("5) Partnership flow untouched");
  assert.match(partnershipAction, /sendPartnershipFormEmail/);
  assert.match(partnershipAction, /readField\(formData,\s*["']fax_number["']\)/);
  assert.match(partnershipSender, /X-MAP-ESIM-Form": "partnership_application"/);
  assert.doesNotMatch(partnershipSender, /X-MAP-ESIM-Form": "contact"/);
  console.log("   ok");

  console.log("6) No secrets in contact path");
  assertNoSecrets(sender);
  assertNoSecrets(action);
  assertNoSecrets(form);
  assert.match(pkg, /"qa:contact-form-email"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=contact-form-email");
}

main();
