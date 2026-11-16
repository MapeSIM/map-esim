/**
 * Manual payment submit notifications (admin alert + customer confirmation).
 * Never throws to callers. Never rolls back persisted orders on SMTP failure.
 */
import "server-only";

import { BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import { prisma } from "@/app/lib/db";
import { getPublicAppBaseUrl } from "@/app/lib/email/activation";
import {
  isEmailConfigured,
  sanitizeEmailHeaderValue,
} from "@/app/lib/email/config";
import { isValidEmail } from "@/app/lib/email/isValidEmail";
import {
  manualPaymentAdminSubject,
  manualPaymentCustomerSubject,
  renderManualPaymentAdminEmailHtml,
  renderManualPaymentAdminEmailText,
  renderManualPaymentCustomerEmailHtml,
  renderManualPaymentCustomerEmailText,
} from "@/app/lib/email/manualPaymentSubmissionTemplate";
import {
  sendChannelMail,
  type SendChannelMailResult,
} from "@/app/lib/email/transport";
import type { EmailChannel } from "@/app/lib/email/channels";
import { MANUAL_CHECKOUT_PAYMENT_METHOD } from "@/app/lib/support/manualCheckoutOrderShared";

/** Bound each SMTP attempt so serverless handlers can finish before idle kill. */
export const MANUAL_PAYMENT_EMAIL_TIMEOUT_MS = 9_000;

export type ManualPaymentEmailDispatchResult = {
  admin: "sent" | "skipped" | "failed";
  customer: "sent" | "skipped" | "failed";
};

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Admin alert recipient for manual payment screenshots.
 * Prefer explicit ops inbox, then support/orders identity, then SMTP user.
 */
export function resolveManualPaymentAdminAlertRecipient(): {
  email: string | null;
  source: string | null;
} {
  const chain: Array<[string, string]> = [
    ["ADMIN_ALERT_EMAIL", readEnv("ADMIN_ALERT_EMAIL")],
    ["SUPPORT_EMAIL", readEnv("SUPPORT_EMAIL")],
    ["ORDERS_FROM_EMAIL", readEnv("ORDERS_FROM_EMAIL")],
    ["SMTP_USER", readEnv("SMTP_USER")],
    ["SMTP_ORDERS_USER", readEnv("SMTP_ORDERS_USER")],
    ["BRAND_SUPPORT_EMAIL", BRAND_SUPPORT_EMAIL],
  ];

  for (const [source, raw] of chain) {
    const email = raw.toLowerCase();
    if (email && isValidEmail(email)) {
      return { email, source };
    }
  }
  return { email: null, source: null };
}

function resolveOrdersOrBillingChannel(): EmailChannel | null {
  if (isEmailConfigured("orders")) return "orders";
  if (isEmailConfigured("billing")) return "billing";
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SMTP_TIMEOUT")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  ) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatAmount(
  displayAmount: unknown,
  displayCurrency: string | null | undefined,
  providerAmount: unknown,
  providerCurrency: string | null | undefined
): string {
  const amount =
    toFiniteNumber(displayAmount) ?? toFiniteNumber(providerAmount);
  const currency =
    (displayCurrency || providerCurrency || "USD").trim().toUpperCase() ||
    "USD";
  if (amount == null) return currency;
  return `${amount.toFixed(2)} ${currency}`;
}

function customerDisplayName(
  senderName: string | null | undefined,
  email: string
): string {
  const sender = (senderName || "").trim();
  if (sender) return sender.slice(0, 80);
  const local = email.split("@")[0]?.trim();
  return local ? local.slice(0, 80) : "Customer";
}

async function sendTimed(
  label: string,
  channel: EmailChannel,
  to: string,
  mail: {
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
  }
): Promise<"sent" | "failed"> {
  try {
    const result: SendChannelMailResult = await withTimeout(
      sendChannelMail({
        channel,
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: mail.headers,
      }),
      MANUAL_PAYMENT_EMAIL_TIMEOUT_MS
    );

    if (result.ok) {
      console.info("manual_payment_email", {
        kind: label,
        channel,
        recipient: to,
        messageId: result.messageId || null,
        status: "sent",
      });
      return "sent";
    }

    console.error("manual_payment_email", {
      kind: label,
      channel,
      recipient: to,
      status: "failed",
      reason: result.reason,
      detail: result.detail || null,
    });
    return "failed";
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 64) : "send_failed";
    console.error("manual_payment_email", {
      kind: label,
      channel,
      recipient: to,
      status: "failed",
      reason: detail === "SMTP_TIMEOUT" ? "timeout" : "send_failed",
      detail,
    });
    return "failed";
  }
}

/**
 * After a manual payment order is durably saved, notify admin + customer.
 * Uses Promise.allSettled semantics internally; never throws.
 */
export async function notifyManualPaymentSubmissionEmails(input: {
  orderId: string | null;
  reference: string;
}): Promise<ManualPaymentEmailDispatchResult> {
  const orderId = (input.orderId || "").trim();
  const reference = (input.reference || "").trim();
  const empty: ManualPaymentEmailDispatchResult = {
    admin: "skipped",
    customer: "skipped",
  };

  if (!orderId || !reference) {
    console.error("manual_payment_email", {
      status: "skipped",
      reason: "missing_order_ids",
    });
    return empty;
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customerEmail: true,
        senderName: true,
        destination: true,
        planName: true,
        displayAmount: true,
        displayCurrency: true,
        providerAmount: true,
        providerCurrency: true,
        paymentMethod: true,
        createdAt: true,
        userId: true,
      },
    });

    if (!order) {
      console.error("manual_payment_email", {
        status: "skipped",
        reason: "order_not_found",
      });
      return empty;
    }

    const customerEmail = (order.customerEmail || "").trim().toLowerCase();
    if (!customerEmail || !isValidEmail(customerEmail)) {
      console.error("manual_payment_email", {
        status: "skipped",
        reason: "invalid_customer_email",
      });
      return empty;
    }

    const channel = resolveOrdersOrBillingChannel();
    if (!channel) {
      console.error("manual_payment_email", {
        status: "skipped",
        reason: "missing_env",
        detail: "orders_and_billing_smtp_not_configured",
      });
      return empty;
    }

    const base = getPublicAppBaseUrl() || BRAND_SITE_URL;
    const amountLabel = formatAmount(
      order.displayAmount,
      order.displayCurrency,
      order.providerAmount,
      order.providerCurrency
    );
    const paymentMethodLabel =
      (order.paymentMethod || MANUAL_CHECKOUT_PAYMENT_METHOD).trim() ||
      MANUAL_CHECKOUT_PAYMENT_METHOD;
    const name = customerDisplayName(order.senderName, customerEmail);
    const destinationLabel = (order.destination || "").trim() || null;
    const planLabel = (order.planName || "").trim() || null;
    const submittedAtLabel = order.createdAt
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, " UTC");
    const adminReviewUrl = `${base}/admin/orders/${encodeURIComponent(order.id)}`;
    const supportUrl = `${base}/support`;
    const accountOrdersUrl = order.userId
      ? `${base}/account/orders`
      : null;

    const adminRecipient = resolveManualPaymentAdminAlertRecipient();
    const adminTask = (async (): Promise<"sent" | "skipped" | "failed"> => {
      if (!adminRecipient.email) {
        console.error("manual_payment_email", {
          kind: "admin_alert",
          status: "skipped",
          reason: "missing_env",
          detail:
            "ADMIN_ALERT_EMAIL|SUPPORT_EMAIL|ORDERS_FROM_EMAIL|SMTP_USER",
        });
        return "skipped";
      }
      const subject = sanitizeEmailHeaderValue(
        manualPaymentAdminSubject(reference),
        160
      );
      const payload = {
        orderId: order.id,
        orderReference: reference,
        customerName: name,
        customerEmail,
        planLabel,
        destinationLabel,
        amountLabel,
        paymentMethodLabel,
        submittedAtLabel,
        adminReviewUrl,
      };
      return sendTimed("admin_alert", channel, adminRecipient.email, {
        subject,
        text: renderManualPaymentAdminEmailText(payload),
        html: renderManualPaymentAdminEmailHtml(payload),
        headers: {
          "X-MAP-ESIM-Manual-Payment": "admin-alert",
          "X-MAP-ESIM-Admin-Recipient-Source": sanitizeEmailHeaderValue(
            adminRecipient.source || "unknown",
            40
          ),
        },
      });
    })();

    const customerTask = (async (): Promise<"sent" | "skipped" | "failed"> => {
      const subject = sanitizeEmailHeaderValue(
        manualPaymentCustomerSubject(reference),
        160
      );
      const payload = {
        customerName: name,
        orderReference: reference,
        planLabel,
        destinationLabel,
        amountLabel,
        paymentMethodLabel,
        supportUrl,
        accountOrdersUrl,
      };
      return sendTimed("customer_confirmation", channel, customerEmail, {
        subject,
        text: renderManualPaymentCustomerEmailText(payload),
        html: renderManualPaymentCustomerEmailHtml(payload),
        headers: {
          "X-MAP-ESIM-Manual-Payment": "customer-confirmation",
        },
      });
    })();

    const settled = await Promise.allSettled([adminTask, customerTask]);
    const admin =
      settled[0]?.status === "fulfilled" ? settled[0].value : "failed";
    const customer =
      settled[1]?.status === "fulfilled" ? settled[1].value : "failed";

    return { admin, customer };
  } catch (error) {
    console.error("manual_payment_email", {
      status: "failed",
      reason: "dispatch_error",
      detail:
        error instanceof Error ? error.message.slice(0, 64) : "dispatch_error",
    });
    return { admin: "failed", customer: "failed" };
  }
}
