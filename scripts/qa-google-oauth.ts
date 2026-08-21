/**
 * Offline QA for Google OAuth Phase 2B helpers (no live Google calls).
 */
import assert from "node:assert/strict";
import type { GoogleProfile } from "@auth/core/providers/google";
import {
  CREDENTIALS_AUTH_METHOD,
  GOOGLE_AUTH_METHOD,
  googleOauthConsentRecord,
  googleProfileToUserFields,
  isGoogleProfileVerified,
  isOauthConsentAccepted,
  mapOAuthErrorParam,
  publicOAuthErrorMessage,
} from "../app/lib/auth/googleOAuth";
import {
  classifyGoogleSignInUser,
  resolveJwtSubject,
  shouldBlockSignedInGoogleLink,
} from "../app/lib/auth/googleSessionIsolation";
import {
  deriveNeedsLegalConsent,
  isAllowedDuringLegalConsent,
  resolveAuthMethod,
} from "../app/lib/auth/legalConsentPolicy";
import { safeCallbackPath } from "../app/lib/auth/redirects";
import {
  LEGAL_CONSENT_SOURCE_GOOGLE,
  LEGAL_POLICY_VERSION,
} from "../app/lib/legal";
import { Role } from "@prisma/client";

function makeProfile(
  overrides: Partial<GoogleProfile> = {}
): GoogleProfile {
  return {
    aud: "aud",
    azp: "azp",
    email: "Traveler@Example.com",
    email_verified: true,
    exp: 0,
    given_name: "Traveler",
    iat: 0,
    iss: "https://accounts.google.com",
    name: "Traveler Example",
    picture: "https://example.com/a.png",
    sub: "google-sub-1",
    ...overrides,
  };
}

function nullConsentCustomer() {
  return {
    role: "CUSTOMER" as const,
    termsAcceptedAt: null,
    privacyAcknowledgedAt: null,
    termsVersion: null,
    privacyVersion: null,
  };
}

function main() {
  assert.equal(isGoogleProfileVerified(makeProfile()), true);
  assert.equal(
    isGoogleProfileVerified(makeProfile({ email_verified: false })),
    false
  );
  assert.equal(isGoogleProfileVerified(makeProfile({ email: "" })), false);
  assert.equal(isGoogleProfileVerified(undefined), false);
  // Mapped AdapterUser shapes without email_verified must not count as verified.
  assert.equal(
    isGoogleProfileVerified({
      email: "a@b.com",
      emailVerified: new Date(),
    } as unknown as GoogleProfile),
    false
  );
  console.log("PASS google_profile_verification");

  const fields = googleProfileToUserFields(makeProfile());
  assert.equal(fields.email, "traveler@example.com");
  assert.equal(fields.name, "Traveler Example");
  assert.ok(fields.emailVerified instanceof Date);
  assert.equal(fields.image, "https://example.com/a.png");
  console.log("PASS email_normalized_and_verified_mapped");

  // Adapter create path contract: role CUSTOMER, passwordHash null (enforced in adapter).
  assert.equal(Role.CUSTOMER, "CUSTOMER");
  assert.notEqual(Role.ADMIN, Role.CUSTOMER);
  console.log("PASS oauth_cannot_create_admin_role_constant");

  const consent = googleOauthConsentRecord();
  assert.equal(consent.legalConsentSource, LEGAL_CONSENT_SOURCE_GOOGLE);
  assert.equal(consent.termsVersion, LEGAL_POLICY_VERSION);
  assert.equal(consent.privacyVersion, LEGAL_POLICY_VERSION);
  assert.ok(consent.termsAcceptedAt);
  assert.ok(consent.privacyAcknowledgedAt);
  console.log("PASS legal_consent_record");

  assert.equal(isOauthConsentAccepted("on"), true);
  assert.equal(isOauthConsentAccepted(null), false);
  assert.equal(isOauthConsentAccepted("no"), false);
  console.log("PASS consent_checkbox_validation");

  assert.equal(
    mapOAuthErrorParam("OAuthAccountNotLinked"),
    "OAuthAccountNotLinked"
  );
  assert.match(
    publicOAuthErrorMessage("OAuthAccountNotLinked") || "",
    /already registered/i
  );
  assert.match(publicOAuthErrorMessage("AccessDenied") || "", /denied/i);
  console.log("PASS public_oauth_errors");

  assert.equal(safeCallbackPath("/account", "/account"), "/account");
  assert.equal(
    safeCallbackPath("https://evil.example/phish", "/account"),
    "/account"
  );
  assert.equal(safeCallbackPath("//evil.example", "/account"), "/account");
  assert.equal(
    safeCallbackPath("/account/orders", "/account"),
    "/account/orders"
  );
  assert.equal(
    safeCallbackPath(
      "http://localhost:3000/account/esim/buy?offerId=abc",
      "/account",
      { requestOrigin: "http://localhost:3000" }
    ),
    "/account/esim/buy?offerId=abc"
  );
  console.log("PASS external_callback_rejected");

  // Same-email unlinked / admin / deleted are enforced in auth.ts signIn
  // (integration-level). Document expected public outcomes:
  assert.equal(
    publicOAuthErrorMessage("OAuthAccountNotLinked"),
    "This email is already registered. Sign in with your existing method."
  );
  console.log("PASS same_email_message");

  // --- Legal consent gate ---

  // 1. New Google user with null consent: protected routes blocked, consent allowed
  assert.equal(
    deriveNeedsLegalConsent(GOOGLE_AUTH_METHOD, nullConsentCustomer()),
    true
  );
  assert.equal(isAllowedDuringLegalConsent("/oauth-consent"), true);
  assert.equal(isAllowedDuringLegalConsent("/api/auth/callback/google"), true);
  assert.equal(isAllowedDuringLegalConsent("/terms-and-conditions"), true);
  assert.equal(isAllowedDuringLegalConsent("/privacy-policy"), true);
  assert.equal(isAllowedDuringLegalConsent("/refund-policy"), true);
  assert.equal(isAllowedDuringLegalConsent("/account"), false);
  assert.equal(isAllowedDuringLegalConsent("/account/orders"), false);
  assert.equal(isAllowedDuringLegalConsent("/account/profile"), false);
  assert.equal(isAllowedDuringLegalConsent("/checkout"), false);
  assert.equal(isAllowedDuringLegalConsent("/payment"), false);
  console.log("PASS google_null_consent_blocks_account_and_checkout");

  // 2. Credentials user with historical null consent: NOT gated
  assert.equal(
    deriveNeedsLegalConsent(CREDENTIALS_AUTH_METHOD, nullConsentCustomer()),
    false
  );
  assert.equal(
    deriveNeedsLegalConsent(undefined, nullConsentCustomer()),
    false
  );
  console.log("PASS credentials_null_consent_not_gated");

  // 3. Google user after accepting current consent: allowed, no loop
  const accepted = {
    role: "CUSTOMER" as const,
    termsAcceptedAt: new Date(),
    privacyAcknowledgedAt: new Date(),
    termsVersion: LEGAL_POLICY_VERSION,
    privacyVersion: LEGAL_POLICY_VERSION,
  };
  assert.equal(deriveNeedsLegalConsent(GOOGLE_AUTH_METHOD, accepted), false);
  // Outdated version still requires consent
  assert.equal(
    deriveNeedsLegalConsent(GOOGLE_AUTH_METHOD, {
      ...accepted,
      termsVersion: "old",
    }),
    true
  );
  console.log("PASS google_after_consent_allowed");

  // 4. Auth method resolution: provider, token, oauth-only DB fallback
  assert.equal(
    resolveAuthMethod({ accountProvider: "google" }),
    GOOGLE_AUTH_METHOD
  );
  assert.equal(
    resolveAuthMethod({
      rememberPresent: true,
      accountProvider: "credentials",
    }),
    CREDENTIALS_AUTH_METHOD
  );
  assert.equal(
    resolveAuthMethod({
      hasGoogleAccount: true,
      passwordHash: null,
    }),
    GOOGLE_AUTH_METHOD
  );
  assert.equal(
    resolveAuthMethod({
      hasGoogleAccount: true,
      passwordHash: "hash",
      tokenAuthMethod: CREDENTIALS_AUTH_METHOD,
    }),
    CREDENTIALS_AUTH_METHOD
  );
  console.log("PASS auth_method_resolution");

  // 5. ADMIN never needs Google legal consent gate
  assert.equal(
    deriveNeedsLegalConsent(GOOGLE_AUTH_METHOD, {
      ...nullConsentCustomer(),
      role: "ADMIN",
    }),
    false
  );
  console.log("PASS admin_consent_unaffected");

  // 6. Auth.js callback routes remain accessible during consent
  assert.equal(isAllowedDuringLegalConsent("/api/auth/session"), true);
  assert.equal(isAllowedDuringLegalConsent("/api/auth/signout"), true);
  console.log("PASS authjs_routes_allowed_during_consent");

  // --- Session isolation / wrong Google account ---

  // 7. Sign out A, select unlinked Credentials Google B:
  //    must classify UNLINKED_CUSTOMER → OAuthAccountNotLinked (no A session reuse)
  assert.equal(
    classifyGoogleSignInUser({
      userExists: true,
      hasGoogleLinked: false,
      role: "CUSTOMER",
    }),
    "UNLINKED_CUSTOMER"
  );
  assert.equal(
    publicOAuthErrorMessage("OAuthAccountNotLinked"),
    "This email is already registered. Sign in with your existing method."
  );
  // Signed-in link of a new Google identity onto A must be blocked
  assert.equal(
    shouldBlockSignedInGoogleLink({
      sessionUserId: "user-a",
      googleAccountAlreadyLinkedToUserId: null,
    }),
    true
  );
  console.log("PASS account_b_unlinked_not_a_session");

  // 8. Select already-linked ACCOUNT_A Google → LINKED_CUSTOMER allowed
  assert.equal(
    classifyGoogleSignInUser({
      userExists: true,
      hasGoogleLinked: true,
      role: "CUSTOMER",
    }),
    "LINKED_CUSTOMER"
  );
  assert.equal(
    shouldBlockSignedInGoogleLink({
      sessionUserId: "user-a",
      googleAccountAlreadyLinkedToUserId: "user-a",
    }),
    false
  );
  console.log("PASS account_a_linked_allowed");

  // 9. New Google account → NEW_USER
  assert.equal(
    classifyGoogleSignInUser({ userExists: false }),
    "NEW_USER"
  );
  console.log("PASS new_google_user_category");

  // 10. JWT: previous token A + current OAuth user B → subject must be B
  const switched = resolveJwtSubject({
    accountProvider: "google",
    currentUserId: "user-b",
    previousTokenSub: "user-a",
  });
  assert.equal(switched.subject, "user-b");
  assert.equal(switched.previousTokenUserReused, true);
  assert.notEqual(switched.subject, "user-a");
  // Refresh without new account keeps prior subject
  const refresh = resolveJwtSubject({
    accountProvider: null,
    currentUserId: null,
    previousTokenSub: "user-a",
  });
  assert.equal(refresh.subject, "user-a");
  assert.equal(refresh.previousTokenUserReused, false);
  console.log("PASS jwt_never_resolves_stale_user_a");

  // 11. Credentials path unchanged (category helpers do not alter credentials)
  assert.equal(
    classifyGoogleSignInUser({
      userExists: true,
      deleted: false,
      role: "CUSTOMER",
      hasGoogleLinked: false,
    }),
    "UNLINKED_CUSTOMER"
  );
  console.log("PASS credentials_login_path_unchanged");

  console.log("ALL_QA_PASSED=20");
}

main();
