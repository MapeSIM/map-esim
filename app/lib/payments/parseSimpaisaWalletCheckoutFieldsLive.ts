/**
 * Async Simpaisa wallet field parse that enforces live admin operator toggles.
 */
import "server-only";

import {
  parseSimpaisaWalletCheckoutFields,
  type ParseSimpaisaWalletCheckoutFieldsResult,
} from "@/app/lib/payments/simpaisaPkrQuote";
import { getSimpaisaWalletOperatorConfig } from "@/app/lib/payments/simpaisaWalletOperatorConfig";

/**
 * Load singleton enablement, then validate operator + MSISDN.
 * Use this on all checkout / top-up initiation paths.
 */
export async function parseSimpaisaWalletCheckoutFieldsLive(input: {
  walletOperatorId: unknown;
  customerMsisdn: unknown;
}): Promise<ParseSimpaisaWalletCheckoutFieldsResult> {
  const operatorConfig = await getSimpaisaWalletOperatorConfig();
  return parseSimpaisaWalletCheckoutFields({
    walletOperatorId: input.walletOperatorId,
    customerMsisdn: input.customerMsisdn,
    operatorConfig,
  });
}
