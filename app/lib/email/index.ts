export { getEmailConfig, isEmailConfigured } from "@/app/lib/email/config";
export {
  deliverOrderEmailAfterCheckout,
  getStoredEmailDelivery,
} from "@/app/lib/email/deliverAfterCheckout";
export { sendOrderEmail } from "@/app/lib/email/sendOrderEmail";
export type {
  EmailDeliveryStatus,
  OrderEmailPayload,
  SendOrderEmailResult,
} from "@/app/lib/email/types";
