import type { OrderSupportTicketSubject } from "@prisma/client";

export const ORDER_SUPPORT_DETAILS_MAX = 2000;

export const ORDER_SUPPORT_TICKET_SUBJECTS = [
  "REFUND_REQUEST",
  "ESIM_NOT_WORKING",
  "ACTIVATION_ISSUE",
  "DATA_NOT_WORKING",
  "QR_INSTALLATION_PROBLEM",
  "WRONG_PLAN_OR_DESTINATION",
  "TOPUP_RECHARGE_ISSUE",
  "BILLING_OR_PAYMENT_ISSUE",
  "CONNECTION_NETWORK_ISSUE",
  "OTHER",
] as const satisfies readonly OrderSupportTicketSubject[];

export type OrderSupportTicketSubjectId =
  (typeof ORDER_SUPPORT_TICKET_SUBJECTS)[number];

const SUBJECT_LABELS: Record<OrderSupportTicketSubjectId, string> = {
  REFUND_REQUEST: "Refund request",
  ESIM_NOT_WORKING: "eSIM not working",
  ACTIVATION_ISSUE: "Activation issue",
  DATA_NOT_WORKING: "Data not working",
  QR_INSTALLATION_PROBLEM: "QR code / installation problem",
  WRONG_PLAN_OR_DESTINATION: "Wrong plan or destination",
  TOPUP_RECHARGE_ISSUE: "Top-up / recharge issue",
  BILLING_OR_PAYMENT_ISSUE: "Billing or payment issue",
  CONNECTION_NETWORK_ISSUE: "Connection / network issue",
  OTHER: "Other",
};

export function orderSupportSubjectLabel(
  subject: string | null | undefined
): string {
  if (!subject) return "Support ticket";
  return (
    SUBJECT_LABELS[subject as OrderSupportTicketSubjectId] ?? String(subject)
  );
}

export function isOrderSupportTicketSubject(
  value: unknown
): value is OrderSupportTicketSubjectId {
  return (
    typeof value === "string" &&
    (ORDER_SUPPORT_TICKET_SUBJECTS as readonly string[]).includes(value)
  );
}

export function orderSupportStatusLabel(
  status: string | null | undefined
): string {
  switch (status) {
    case "OPEN":
    case "PENDING_REVIEW":
      return "Pending admin review";
    case "RESOLVED":
      return "Resolved";
    case "REJECTED":
      return "Rejected";
    case "REFUNDED":
      return "Approved / refunded";
    default:
      return status?.trim() || "Unknown";
  }
}

export function orderSupportStatusTone(
  status: string | null | undefined
): "pending" | "resolved" | "rejected" | "refunded" | "neutral" {
  switch (status) {
    case "OPEN":
    case "PENDING_REVIEW":
      return "pending";
    case "RESOLVED":
      return "resolved";
    case "REJECTED":
      return "rejected";
    case "REFUNDED":
      return "refunded";
    default:
      return "neutral";
  }
}

export const ORDER_SUPPORT_AUDIT = {
  create: "order_support_ticket.create",
  resolve: "order_support_ticket.resolve",
  reject: "order_support_ticket.reject",
  approveRefund: "order_support_ticket.approve_refund",
} as const;
