/**
 * Offline QA: Partner pre-claim logging must not alter control flow
 * and must never include secret-like fields.
 */
import assert from "node:assert/strict";
import {
  PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT,
  buildPartnerProviderPreclaimLogPayload,
  logPartnerProviderPreclaimError,
  safeErrorClassification,
  safeErrorCode,
  safeErrorName,
} from "../app/lib/partner/partnerPurchasePreclaimLog";

class SampleCodedError extends Error {
  readonly code = "SAMPLE_CODE";
  constructor() {
    super("sample failure for logging");
    this.name = "SampleCodedError";
  }
}

function main() {
  const originalError = console.error;
  const lines: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args);
  };

  try {
    // 1) Payload shape / safe fields only
    const payload = buildPartnerProviderPreclaimLogPayload({
      purchaseId: "cmtnb0rpk0001jw04lu32z3ln",
      stage: "before_claim",
      executionClaimed: false,
      error: new SampleCodedError(),
    });
    assert.equal(payload.event, PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT);
    assert.equal(payload.purchaseId, "cmtnb0rpk0001jw04lu32z3ln");
    assert.equal(payload.stage, "before_claim");
    assert.equal(payload.executionClaimed, false);
    assert.equal(payload.errorName, "SampleCodedError");
    assert.equal(payload.errorCode, "SAMPLE_CODE");
    assert.match(payload.errorClassification, /sample failure/i);

    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes("DATABASE_URL"), false);
    assert.equal(serialized.includes("password"), false);
    assert.equal(serialized.includes("ICCID"), false);
    assert.equal(serialized.includes("Authorization"), false);

    // 2) Logging never throws and does not swallow the caller throw path
    lines.length = 0;
    const returned = logPartnerProviderPreclaimError({
      purchaseId: "abc123",
      stage: "claim",
      executionClaimed: false,
      error: new Error("claim boom"),
    });
    assert.equal(returned.event, PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT);
    assert.equal(lines.length, 1);
    assert.equal(lines[0][0], PARTNER_PROVIDER_PRECLAIM_ERROR_EVENT);

    let threw = false;
    try {
      try {
        throw new Error("control_flow_probe");
      } catch (error) {
        logPartnerProviderPreclaimError({
          purchaseId: "abc123",
          stage: "before_claim",
          executionClaimed: false,
          error,
        });
        throw error;
      }
    } catch (error) {
      threw = true;
      assert.ok(error instanceof Error);
      assert.equal(error.message, "control_flow_probe");
    }
    assert.equal(threw, true);

    // 3) Redaction helpers
    assert.equal(safeErrorName(null), "null");
    assert.equal(safeErrorCode({ code: "postgres://secret" }), null);
    assert.equal(safeErrorCode({ code: "VESIM_ENV_INVALID" }), "VESIM_ENV_INVALID");
    assert.match(
      safeErrorClassification(
        new Error("fail for user@example.com see https://evil.example/x")
      ),
      /\[redacted_email\]/
    );
    assert.match(
      safeErrorClassification(
        new Error("fail for user@example.com see https://evil.example/x")
      ),
      /\[redacted_url\]/
    );

    // 4) console.error failure must not change control flow
    console.error = () => {
      throw new Error("console_broken");
    };
    assert.doesNotThrow(() =>
      logPartnerProviderPreclaimError({
        purchaseId: "abc123",
        stage: "pre_provider_gate",
        executionClaimed: false,
        error: new Error("still safe"),
      })
    );

    console.log("PASS partner_preclaim_log_no_control_flow_change");
    console.log("ALL PASS qa-partner-preclaim-log");
  } finally {
    console.error = originalError;
  }
}

main();
