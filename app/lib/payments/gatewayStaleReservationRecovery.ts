/**
 * Combined customer + partner gateway stale reservation recovery.
 * Also releases stuck full-wallet PROVIDER_PENDING debits with no Order
 * (customer + partner wallet-only paths).
 * Never funds purchases and never calls VeSIM.
 */
import "server-only";

import {
  runCustomerGatewayStaleReservationRecovery,
  type CustomerGatewayStaleRecoveryResult,
} from "@/app/lib/esim/esimPurchaseGatewayStaleRunner";
import {
  resolveCustomerGatewayStaleIdleMs,
  resolveCustomerGatewayStaleMaxAgeMs,
} from "@/app/lib/esim/esimPurchaseGatewayStaleShared";
import {
  FULL_WALLET_STALE_IDLE_MS,
  runFullWalletStaleReservationRelease,
  type FullWalletStaleReleaseResult,
} from "@/app/lib/esim/walletPurchaseStaleRelease";
import {
  PARTNER_FULL_WALLET_STALE_IDLE_MS,
  runPartnerFullWalletStaleReservationRelease,
  type PartnerFullWalletStaleReleaseResult,
} from "@/app/lib/partner/partnerEsimPurchaseFullWalletStaleRelease";
import {
  runPartnerGatewayStaleReservationRecovery,
  type PartnerGatewayStaleRecoveryResult,
} from "@/app/lib/partner/partnerEsimPurchaseGatewayStaleRunner";
import {
  resolvePartnerGatewayStaleIdleMs,
  resolvePartnerGatewayStaleMaxAgeMs,
} from "@/app/lib/partner/partnerEsimPurchaseGatewayStaleShared";

export type GatewayStaleReservationRecoveryResult = {
  ok: boolean;
  customer: CustomerGatewayStaleRecoveryResult;
  partner: PartnerGatewayStaleRecoveryResult;
  fullWallet: FullWalletStaleReleaseResult;
  partnerFullWallet: PartnerFullWalletStaleReleaseResult;
};

const EMPTY_COUNTS = {
  scanned: 0,
  eligible: 0,
  released: 0,
  skipped: 0,
  errors: 1,
} as const;

function settledOrFallback<T>(
  settled: PromiseSettledResult<T>,
  fallback: () => T
): T {
  if (settled.status === "fulfilled") return settled.value;
  return fallback();
}

export async function runGatewayStaleReservationRecovery(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<GatewayStaleReservationRecoveryResult> {
  // Isolate sub-jobs: one unexpected throw must not cancel the others.
  const [customerSettled, partnerSettled, fullWalletSettled, partnerFullWalletSettled] =
    await Promise.allSettled([
      runCustomerGatewayStaleReservationRecovery(options),
      runPartnerGatewayStaleReservationRecovery(options),
      runFullWalletStaleReservationRelease(options),
      runPartnerFullWalletStaleReservationRelease(options),
    ]);

  const customer = settledOrFallback(customerSettled, () => ({
    ok: false,
    counts: { ...EMPTY_COUNTS },
    idleMs: resolveCustomerGatewayStaleIdleMs(),
    maxAgeMs: resolveCustomerGatewayStaleMaxAgeMs(),
    errorCode: "sub_job_rejected",
  }));
  const partner = settledOrFallback(partnerSettled, () => ({
    ok: false,
    counts: { ...EMPTY_COUNTS },
    idleMs: resolvePartnerGatewayStaleIdleMs(),
    maxAgeMs: resolvePartnerGatewayStaleMaxAgeMs(),
    errorCode: "sub_job_rejected",
  }));
  const fullWallet = settledOrFallback(fullWalletSettled, () => ({
    ok: false,
    counts: { ...EMPTY_COUNTS },
    idleMs: FULL_WALLET_STALE_IDLE_MS,
    errorCode: "sub_job_rejected",
  }));
  const partnerFullWallet = settledOrFallback(partnerFullWalletSettled, () => ({
    ok: false,
    counts: { ...EMPTY_COUNTS },
    idleMs: PARTNER_FULL_WALLET_STALE_IDLE_MS,
    errorCode: "sub_job_rejected",
  }));

  return {
    ok:
      customer.ok &&
      partner.ok &&
      fullWallet.ok &&
      partnerFullWallet.ok,
    customer,
    partner,
    fullWallet,
    partnerFullWallet,
  };
}
