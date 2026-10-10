"use server";

import { requireRole } from "@/app/lib/auth/session";
import { createWhatsAppPendingOrder } from "@/app/lib/esim/whatsappCheckoutOrder";

export type CreateWhatsAppPendingOrderActionResult =
  | {
      success: true;
      redirectUrl: string;
      orderReference: string;
      orderId: string;
    }
  | { success: false; error: string };

export async function createWhatsAppPendingOrderAction(input: {
  purchaseId: string;
}): Promise<CreateWhatsAppPendingOrderActionResult> {
  const user = await requireRole("CUSTOMER");
  return createWhatsAppPendingOrder({
    customerUserId: user.id,
    purchaseId: input.purchaseId,
  });
}
