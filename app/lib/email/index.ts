export {
  EMAIL_CHANNEL_IDS,
  EMAIL_CHANNELS,
  SUPPORT_FROM,
  SUPPORT_MAILBOX,
  formatChannelFrom,
  formatChannelReplyTo,
  getChannelDefinition,
  isEmailChannel,
  type EmailChannel,
} from "@/app/lib/email/channels";
export {
  getEmailConfig,
  isEmailConfigured,
  resolveSmtpTls,
  sanitizeEmailHeaderValue,
} from "@/app/lib/email/config";
export {
  deliverOrderEmailAfterCheckout,
  getStoredEmailDelivery,
} from "@/app/lib/email/deliverAfterCheckout";
export { sendOrderEmail } from "@/app/lib/email/sendOrderEmail";
export { sendOtpEmail } from "@/app/lib/email/sendOtpEmail";
export {
  sendAccountDeletedEmail,
  sendPasswordChangedEmail,
} from "@/app/lib/email/sendSecurityNoticeEmail";
export { sendBillingEmail } from "@/app/lib/email/sendBillingEmail";
export { sendSupportEmail } from "@/app/lib/email/sendSupportEmail";
export { sendChannelMail } from "@/app/lib/email/transport";
export type {
  EmailDeliveryStatus,
  OrderEmailPayload,
  SendOrderEmailResult,
} from "@/app/lib/email/types";
