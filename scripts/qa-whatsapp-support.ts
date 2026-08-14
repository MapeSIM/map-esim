/**
 * Offline QA for admin-controlled public WhatsApp support button.
 *
 * Covers schema/migration, validation, route policy, public payload shape,
 * admin UI wiring, Tawk coexistence (untouched), and no OperationalControl overload.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WHATSAPP_MESSAGE_MAX,
  WHATSAPP_SUPPORT_CONFIG_ID,
  buildWhatsAppClickToChatUrl,
  isWhatsAppSupportRoute,
  parseWhatsAppDefaultMessage,
  parseWhatsAppPhoneDigits,
  toPublicWhatsAppSupportConfig,
} from "../app/lib/support/whatsappSupportShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260814120000_add_whatsapp_support_config/migration.sql"
  );
  const shared = read("app/lib/support/whatsappSupportShared.ts");
  const server = read("app/lib/support/whatsappSupport.ts");
  const mut = read("app/lib/admin/whatsappSupport.ts");
  const actions = read("app/lib/admin/whatsappSupportActions.ts");
  const api = read("app/api/support/whatsapp/route.ts");
  const button = read("app/components/support/WhatsAppSupportButton.tsx");
  const panel = read("app/components/admin/WhatsAppSupportPanel.tsx");
  const opsPage = read("app/admin/operations/page.tsx");
  const layout = read("app/layout.tsx");
  const tawkChat = read("app/components/support/TawkChat.tsx");
  const tawkRoutes = read("app/lib/support/tawkRoutes.ts");
  const tawkConfig = read("app/lib/support/tawkConfig.ts");
  const consentGate = read("app/components/cookies/ConsentScriptGate.tsx");
  const opsControlsShared = read("app/lib/admin/operationalControlsShared.ts");
  const opsControlsMut = read("app/lib/admin/operationalControls.ts");
  const pkg = read("package.json");

  // --- Schema / migration ---
  assert.match(schema, /model WhatsAppSupportConfig/);
  assert.match(schema, /enabled\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /phoneE164\s+String\?/);
  assert.match(schema, /defaultMessage\s+String\?/);
  assert.doesNotMatch(
    schema,
    /model WhatsAppSupportConfig[\s\S]{0,500}Json/
  );
  assert.match(migration, /CREATE TABLE "WhatsAppSupportConfig"/);
  assert.match(migration, /"enabled" BOOLEAN NOT NULL DEFAULT false/);
  assert.equal(WHATSAPP_SUPPORT_CONFIG_ID, "default");
  console.log("PASS schema_migration_default_off");

  // --- OperationalControl contract untouched ---
  assert.doesNotMatch(opsControlsShared, /WhatsApp|whatsapp|wa\.me/i);
  assert.doesNotMatch(opsControlsMut, /WhatsApp|whatsapp|wa\.me/i);
  assert.doesNotMatch(schema, /model OperationalControl[\s\S]{0,400}phone/);
  console.log("PASS operational_control_untouched");

  // --- Phone validation / normalization ---
  const phoneOk = parseWhatsAppPhoneDigits("+923001234567");
  assert.equal(phoneOk.ok, true);
  if (phoneOk.ok) {
    assert.equal(phoneOk.digits, "923001234567");
  }
  const phoneSpaced = parseWhatsAppPhoneDigits("92 300-123-4567");
  assert.equal(phoneSpaced.ok, true);
  if (phoneSpaced.ok) {
    assert.equal(phoneSpaced.digits, "923001234567");
  }
  assert.equal(parseWhatsAppPhoneDigits("abc").ok, false);
  assert.equal(parseWhatsAppPhoneDigits("https://wa.me/123").ok, false);
  assert.equal(parseWhatsAppPhoneDigits("<script>").ok, false);
  assert.equal(parseWhatsAppPhoneDigits("+0123").ok, false);
  assert.equal(parseWhatsAppPhoneDigits("1234567").ok, false); // too short
  console.log("PASS phone_validation");

  // --- Message validation ---
  const msgTrim = parseWhatsAppDefaultMessage("  Hello MAP  ");
  assert.equal(msgTrim.ok, true);
  if (msgTrim.ok) {
    assert.equal(msgTrim.message, "Hello MAP");
  }
  const long = "x".repeat(WHATSAPP_MESSAGE_MAX + 1);
  assert.equal(parseWhatsAppDefaultMessage(long).ok, false);
  const htmlish = parseWhatsAppDefaultMessage('<img src=x onerror="alert(1)">');
  assert.equal(htmlish.ok, true);
  if (htmlish.ok) {
    // Stored as plain text only — button/API never dangerouslySetInnerHTML
    assert.match(htmlish.message, /img/);
  }
  console.log("PASS message_validation");

  // --- wa.me URL ---
  assert.equal(
    buildWhatsAppClickToChatUrl("923001234567", "Hi MAP"),
    `https://wa.me/923001234567?text=${encodeURIComponent("Hi MAP")}`
  );
  assert.equal(
    buildWhatsAppClickToChatUrl("923001234567", ""),
    "https://wa.me/923001234567"
  );
  console.log("PASS wa_me_url");

  // --- Public payload: default off; enabled needs valid phone ---
  assert.deepEqual(
    toPublicWhatsAppSupportConfig({
      enabled: false,
      phoneE164: "923001234567",
      defaultMessage: "Hi",
    }),
    { enabled: false }
  );
  assert.deepEqual(
    toPublicWhatsAppSupportConfig({
      enabled: true,
      phoneE164: null,
      defaultMessage: "Hi",
    }),
    { enabled: false }
  );
  const publicOn = toPublicWhatsAppSupportConfig({
    enabled: true,
    phoneE164: "923001234567",
    defaultMessage: "Need help",
  });
  assert.equal(publicOn.enabled, true);
  if (publicOn.enabled) {
    assert.equal(publicOn.phone, "923001234567");
    assert.equal(publicOn.message, "Need help");
    assert.equal(
      publicOn.href,
      `https://wa.me/923001234567?text=${encodeURIComponent("Need help")}`
    );
    assert.doesNotMatch(JSON.stringify(publicOn), /updatedBy|version|admin/i);
  }
  console.log("PASS public_payload_no_admin_metadata");

  // --- Route allow / deny ---
  for (const path of [
    "/",
    "/countries",
    "/countries/japan",
    "/plans",
    "/how-it-works",
    "/device-compatibility",
    "/support",
    "/contact",
  ]) {
    assert.equal(isWhatsAppSupportRoute(path), true, `allow ${path}`);
  }
  for (const path of [
    "/admin",
    "/admin/operations",
    "/api/support/whatsapp",
    "/signin",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/account",
    "/account/orders",
    "/checkout",
    "/checkout/pay",
    "/payment",
    "/payment/return",
    "/success",
    "/success/abc",
  ]) {
    assert.equal(isWhatsAppSupportRoute(path), false, `deny ${path}`);
  }
  console.log("PASS route_allow_deny");

  // --- Admin write path security markers ---
  assert.match(mut, /assertSameOriginAdminRequest/);
  assert.match(mut, /requireActiveAdminActor|Role\.ADMIN/);
  assert.match(mut, /support\.whatsapp_config_updated/);
  assert.match(mut, /support\.whatsapp_config_blocked/);
  assert.match(mut, /version/);
  assert.match(mut, /A valid WhatsApp number is required when the button is enabled/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(server, /upsert/);
  console.log("PASS admin_security_audit_cas");

  // --- Public API ---
  assert.match(api, /Cache-Control.*no-store|no-store/);
  assert.match(api, /getPublicWhatsAppSupportConfig/);
  assert.doesNotMatch(api, /updatedByAdminId|version/);
  console.log("PASS public_api_no_store");

  // --- UI wiring ---
  assert.match(opsPage, /WhatsAppSupportPanel/);
  assert.match(panel, /WhatsApp Support Button/);
  assert.match(panel, /without redeploy/);
  assert.match(panel, /saveWhatsAppSupportConfigAction/);
  assert.match(layout, /WhatsAppSupportButton/);
  assert.match(button, /bottom/);
  assert.match(button, /left/);
  assert.match(button, /noopener noreferrer/);
  assert.match(button, /aria-label/);
  assert.match(button, /isWhatsAppSupportRoute/);
  assert.match(button, /\/api\/support\/whatsapp/);
  assert.doesNotMatch(button, /dangerouslySetInnerHTML/);
  assert.match(pkg, /qa:whatsapp-support/);
  console.log("PASS admin_ui_and_button_wiring");

  // --- Tawk untouched ---
  assert.doesNotMatch(tawkChat, /WhatsApp|whatsapp|wa\.me/i);
  assert.doesNotMatch(tawkRoutes, /WhatsApp|whatsapp|wa\.me/i);
  assert.doesNotMatch(tawkConfig, /WhatsApp|whatsapp|wa\.me/i);
  assert.doesNotMatch(consentGate, /WhatsApp|whatsapp|wa\.me/i);
  assert.match(button, /Independent of Tawk|Tawk/);
  console.log("PASS tawk_untouched");

  // --- Runtime without redeploy (markers) ---
  assert.match(api, /force-dynamic|no-store/);
  assert.match(button, /cache:\s*"no-store"/);
  assert.match(panel, /without redeploy/);
  console.log("PASS runtime_no_redeploy_markers");

  console.log("ALL PASS qa-whatsapp-support");
}

main();
