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

export const ORDER_SUPPORT_TICKET_STATUSES = [
  "OPEN",
  "PENDING_REVIEW",
  "IN_REVIEW",
  "INFO_REQUIRED",
  "RESOLVED",
  "REJECTED",
  "REFUNDED",
] as const;

export type OrderSupportTicketStatusId =
  (typeof ORDER_SUPPORT_TICKET_STATUSES)[number];

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

/** Non-terminal statuses — one open ticket per order remains locked. */
export function isOrderSupportTicketOpenStatus(
  status: string | null | undefined
): boolean {
  return (
    status === "OPEN" ||
    status === "PENDING_REVIEW" ||
    status === "IN_REVIEW" ||
    status === "INFO_REQUIRED"
  );
}

export function isOrderSupportTicketTerminalStatus(
  status: string | null | undefined
): boolean {
  return (
    status === "RESOLVED" ||
    status === "REJECTED" ||
    status === "REFUNDED"
  );
}

export function orderSupportStatusLabel(
  status: string | null | undefined
): string {
  switch (status) {
    case "OPEN":
    case "PENDING_REVIEW":
      return "Pending";
    case "IN_REVIEW":
      return "In Review";
    case "INFO_REQUIRED":
      return "Info Required";
    case "RESOLVED":
      return "Resolved";
    case "REJECTED":
      return "Rejected";
    case "REFUNDED":
      return "Resolved";
    default:
      return status?.trim() || "Unknown";
  }
}

/** Pill text shown in the Support ticket modal: `Ticket: …`. */
export function orderSupportTicketPillLabel(
  status: string | null | undefined
): string {
  switch (status) {
    case "OPEN":
    case "PENDING_REVIEW":
      return "Ticket: Pending";
    case "IN_REVIEW":
      return "Ticket: In Review";
    case "INFO_REQUIRED":
      return "Ticket: Info Required";
    case "RESOLVED":
    case "REFUNDED":
      return "Ticket: Resolved";
    case "REJECTED":
      return "Ticket: Rejected";
    default:
      return `Ticket: ${orderSupportStatusLabel(status)}`;
  }
}

export function orderSupportStatusTone(
  status: string | null | undefined
):
  | "pending"
  | "review"
  | "info"
  | "resolved"
  | "rejected"
  | "refunded"
  | "neutral" {
  switch (status) {
    case "OPEN":
    case "PENDING_REVIEW":
      return "pending";
    case "IN_REVIEW":
      return "review";
    case "INFO_REQUIRED":
      return "info";
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

export type OrderSupportProgressStepId =
  | "pending"
  | "in_review"
  | "info_required"
  | "terminal";

export type OrderSupportProgressModel = {
  steps: Array<{
    id: OrderSupportProgressStepId;
    label: string;
    state: "complete" | "active" | "upcoming";
    index: number;
  }>;
  subtitle: string;
  terminalLabel: "Resolved" | "Rejected";
};

/**
 * 4-step tracker for the Support ticket modal.
 * Step 4 label flips to Rejected when the ticket was rejected.
 */
export function buildOrderSupportProgressModel(
  status: string | null | undefined
): OrderSupportProgressModel {
  const terminalLabel: "Resolved" | "Rejected" =
    status === "REJECTED" ? "Rejected" : "Resolved";

  let activeIndex = 0;
  let subtitle = "We've received your request and will begin review shortly.";

  switch (status) {
    case "OPEN":
    case "PENDING_REVIEW":
      activeIndex = 0;
      subtitle = "We've received your request and will begin review shortly.";
      break;
    case "IN_REVIEW":
      activeIndex = 1;
      subtitle = "Our team is reviewing your request.";
      break;
    case "INFO_REQUIRED":
      activeIndex = 2;
      subtitle = "Additional information is required.";
      break;
    case "RESOLVED":
      activeIndex = 3;
      subtitle = "This ticket has been resolved.";
      break;
    case "REFUNDED":
      activeIndex = 3;
      subtitle = "Refund has been issued.";
      break;
    case "REJECTED":
      activeIndex = 3;
      subtitle = "This ticket was rejected.";
      break;
    default:
      activeIndex = 0;
      break;
  }

  const labels: Array<{ id: OrderSupportProgressStepId; label: string }> = [
    { id: "pending", label: "Pending" },
    { id: "in_review", label: "In Review" },
    { id: "info_required", label: "Info Required" },
    { id: "terminal", label: terminalLabel },
  ];

  const isTerminal = isOrderSupportTicketTerminalStatus(status);

  return {
    terminalLabel,
    subtitle,
    steps: labels.map((step, index) => {
      let state: "complete" | "active" | "upcoming" = "upcoming";
      if (isTerminal) {
        state = index <= activeIndex ? "complete" : "upcoming";
      } else if (index < activeIndex) {
        state = "complete";
      } else if (index === activeIndex) {
        state = "active";
      }
      return { ...step, index: index + 1, state };
    }),
  };
}

export const ORDER_SUPPORT_AUDIT = {
  create: "order_support_ticket.create",
  resolve: "order_support_ticket.resolve",
  reject: "order_support_ticket.reject",
  approveRefund: "order_support_ticket.approve_refund",
  setInReview: "order_support_ticket.set_in_review",
  setInfoRequired: "order_support_ticket.set_info_required",
} as const;
