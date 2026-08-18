export type EmailDeliveryStatus =
  | "sent"
  | "sending"
  | "not_configured"
  | "skipped_no_install_details"
  | "invalid_email"
  | "already_sent"
  | "failed";

export type OrderEmailPayload = {
  customerEmail: string;
  orderId: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  iccid?: string;
  qrValue?: string;
  smdpAddress?: string;
  activationCode?: string;
  /**
   * Exact official provider iPhone activation URL (validated server-side).
   * Never invent from LPA for email buttons.
   */
  iphoneActivationUrl?: string;
  /**
   * Exact official provider Android activation URL (validated server-side).
   * Omit when VeSIM does not supply one.
   */
  androidActivationUrl?: string;
  /** Absolute URL to the MAP eSIM Android installation guide. */
  androidGuideUrl?: string;
  /** Absolute URL to the MAP eSIM iPhone installation guide. */
  iphoneGuideUrl?: string;
  /**
   * Opaque authorized success-page URL (includes signed access token only).
   * Never includes LPA / ICCID / activation secrets.
   */
  orderAccessUrl?: string;
  /**
   * Optional customer-facing notice (e.g. admin-assisted wallet purchase).
   * Never includes secrets.
   */
  supportPurchaseNotice?: string;
};

export type SendOrderEmailResult = {
  emailDelivery: EmailDeliveryStatus;
  detail?: string;
};
