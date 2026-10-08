/**
 * Combined customer + partner gateway stale reservation recovery.
 * Also releases stuck full-wallet PROVIDER_PENDING debits with no Order.
 * Never funds purchases and never calls VeSIM.
 */
import "server-only";

import {
  runCustomerGatewayStaleReservationRecovery,
  type CustomerGatewayStaleRecoveryResult,
} from "@/app/lib/esim/esimPurchaseGatewayStaleRunner";
import {
  runFullWalletStaleReservationRelease,
  type FullWalletStaleReleaseResult,
} from "@/app/lib/esim/walletPurchaseStaleRelease";
import {
  runPartnerGatewayStaleReservationRecovery,
  type PartnerGatewayStaleRecoveryResult,
} from "@/app/lib/partner/partnerEsimPurchaseGatewayStaleRunner";

export type GatewayStaleReservationRecoveryResult = {
  ok: boolean;
  customer: CustomerGatewayStaleRecoveryResult;
  partner: PartnerGatewayStaleRecoveryResult;
  fullWallet: FullWalletStaleReleaseResult;
};

export async function runGatewayStaleReservationRecovery(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<GatewayStaleReservationRecoveryResult> {
  const [customer, partner, fullWallet] = await Promise.all([
    runCustomerGatewayStaleReservationRecovery(options),
    runPartnerGatewayStaleReservationRecovery(options),
    runFullWalletStaleReservationRelease(options),
  ]);

  return {
    ok: customer.ok && partner.ok && fullWallet.ok,
    customer,
    partner,
    fullWallet,
  };
}
