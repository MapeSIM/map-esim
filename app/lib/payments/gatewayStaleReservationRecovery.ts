/**
 * Combined customer + partner gateway stale reservation recovery.
 * Never funds purchases and never calls VeSIM.
 */
import "server-only";

import {
  runCustomerGatewayStaleReservationRecovery,
  type CustomerGatewayStaleRecoveryResult,
} from "@/app/lib/esim/esimPurchaseGatewayStaleRunner";
import {
  runPartnerGatewayStaleReservationRecovery,
  type PartnerGatewayStaleRecoveryResult,
} from "@/app/lib/partner/partnerEsimPurchaseGatewayStaleRunner";

export type GatewayStaleReservationRecoveryResult = {
  ok: boolean;
  customer: CustomerGatewayStaleRecoveryResult;
  partner: PartnerGatewayStaleRecoveryResult;
};

export async function runGatewayStaleReservationRecovery(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<GatewayStaleReservationRecoveryResult> {
  const [customer, partner] = await Promise.all([
    runCustomerGatewayStaleReservationRecovery(options),
    runPartnerGatewayStaleReservationRecovery(options),
  ]);

  return {
    ok: customer.ok && partner.ok,
    customer,
    partner,
  };
}
