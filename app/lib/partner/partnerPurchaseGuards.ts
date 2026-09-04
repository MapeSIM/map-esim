/**
 * Shared Partner purchase gates (ops controls + provider config).
 * Must pass before wallet debit / provider claim.
 * Throws OperationalControl* / VesimEnvironmentError — callers map to Partner errors.
 */
import "server-only";

import { assertNewRiskyTransactionAllowed } from "@/app/lib/admin/operationalControlsPolicy";
import { getVesimBaseUrl } from "@/app/lib/vesim/server";

/** Partner wallet purchase initiation (no provider-order gate). */
export async function assertPartnerPurchaseInitiationAllowed(): Promise<void> {
  await assertNewRiskyTransactionAllowed("partner_wallet_purchase", {
    includeProviderOrder: false,
  });
}

/**
 * Provider-order creation + partner purchase controls.
 * Must pass before permanent wallet debit and before VeSIM checkout.
 */
export async function assertPartnerProviderExecutionAllowed(): Promise<void> {
  await assertNewRiskyTransactionAllowed("partner_wallet_purchase", {
    includeProviderOrder: true,
  });
}

/**
 * Deterministic VeSIM environment/base-url readiness (no network purchase).
 * Fail closed before debit when staging/live config is invalid.
 */
export function assertPartnerProviderConfigReady(): void {
  getVesimBaseUrl();
}

/** All deterministic pre-VeSIM gates that must pass before wallet debit. */
export async function assertPartnerPreDebitProviderGates(): Promise<void> {
  await assertPartnerProviderExecutionAllowed();
  assertPartnerProviderConfigReady();
}
