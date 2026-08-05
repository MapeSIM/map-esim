import "server-only";

import { prisma } from "@/app/lib/db";
import {
  captureIccidForProviderOrder as captureIccidForProviderOrderCore,
  type CaptureIccidResult,
  type CaptureIccidStatus,
  type IccidCaptureDbClient,
} from "@/app/lib/orders/iccidCaptureCore";

export type { CaptureIccidResult, CaptureIccidStatus };

/**
 * Fill-once ICCID capture bound to providerOrderId.
 * Never overwrites a different stored ICCID. Never logs ICCID values.
 */
export async function captureIccidForProviderOrder(
  options: {
    providerOrderId: string;
    iccid?: string | null;
    checkoutPayload?: Record<string, unknown> | null;
  },
  client: IccidCaptureDbClient = prisma
): Promise<CaptureIccidResult> {
  return captureIccidForProviderOrderCore(options, client);
}
