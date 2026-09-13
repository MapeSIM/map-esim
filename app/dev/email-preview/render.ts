/**
 * TEMPORARY DEV-ONLY email HTML renderer for customer template previews.
 * Do not commit. Does not send mail.
 */
import { renderAbandonedCheckoutEmailHtml } from "@/app/lib/email/abandonedCheckoutTemplate";
import { renderEsimLifecycleEmailHtml } from "@/app/lib/email/esimLifecycleTemplate";
import { renderPaymentFailureEmailHtml } from "@/app/lib/email/paymentFailureTemplate";
import { renderPaymentReceivedPendingEmailHtml } from "@/app/lib/email/paymentReceivedPendingTemplate";
import {
  renderRefundStatusEmailHtml,
  type RefundStatusEmailKind,
} from "@/app/lib/email/refundStatusTemplate";
import { renderWalletTransactionEmailHtml } from "@/app/lib/email/walletTransactionTemplate";
import type { EsimLifecycleKind } from "@/app/lib/esim/esimLifecycleNotificationShared";
import {
  EXPIRY_REMINDER_KINDS,
  REFUND_STATUS_KINDS,
  sampleAbandonedCheckoutPayload,
  sampleExpiryReminderPayload,
  samplePaymentFailurePayload,
  samplePaymentReceivedPendingPayload,
  samplePurchaseConfirmationPayload,
  sampleRefundStatusPayload,
  type DevEmailPreviewTemplateId,
} from "@/app/dev/email-preview/samples";

export type DevCustomerEmailPreviewOptions = {
  template: DevEmailPreviewTemplateId;
  /** Refund status variant. */
  refundKind?: RefundStatusEmailKind;
  /** Lifecycle / expiry variant. */
  lifecycleKind?: EsimLifecycleKind;
};

function resolveRefundKind(value?: string): RefundStatusEmailKind {
  if (value && (REFUND_STATUS_KINDS as string[]).includes(value)) {
    return value as RefundStatusEmailKind;
  }
  return "received";
}

function resolveLifecycleKind(value?: string): EsimLifecycleKind {
  if (value && (EXPIRY_REMINDER_KINDS as string[]).includes(value)) {
    return value as EsimLifecycleKind;
  }
  return "EXPIRY_SOON_24H";
}

export function renderDevCustomerEmailPreviewHtml(
  options: DevCustomerEmailPreviewOptions
): string {
  switch (options.template) {
    case "purchase-confirmation":
      return renderWalletTransactionEmailHtml(
        samplePurchaseConfirmationPayload()
      );
    case "abandoned-checkout":
      return renderAbandonedCheckoutEmailHtml(sampleAbandonedCheckoutPayload());
    case "expiry-reminder":
      return renderEsimLifecycleEmailHtml(
        sampleExpiryReminderPayload(
          resolveLifecycleKind(options.lifecycleKind)
        )
      );
    case "refund-status":
      return renderRefundStatusEmailHtml(
        sampleRefundStatusPayload(resolveRefundKind(options.refundKind))
      );
    case "payment-received-pending":
      return renderPaymentReceivedPendingEmailHtml(
        samplePaymentReceivedPendingPayload()
      );
    case "payment-failure":
      return renderPaymentFailureEmailHtml(samplePaymentFailurePayload());
    default: {
      const _exhaustive: never = options.template;
      return _exhaustive;
    }
  }
}

export function parseDevCustomerEmailPreviewQuery(query: {
  template?: string;
  kind?: string;
}): DevCustomerEmailPreviewOptions | null {
  const template = query.template?.trim();
  if (
    !template ||
    ![
      "purchase-confirmation",
      "abandoned-checkout",
      "expiry-reminder",
      "refund-status",
      "payment-received-pending",
      "payment-failure",
    ].includes(template)
  ) {
    return null;
  }

  const id = template as DevEmailPreviewTemplateId;
  if (id === "refund-status") {
    return { template: id, refundKind: resolveRefundKind(query.kind) };
  }
  if (id === "expiry-reminder") {
    return { template: id, lifecycleKind: resolveLifecycleKind(query.kind) };
  }
  return { template: id };
}
