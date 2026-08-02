export type EmailDeliveryStatus =
  | "sent"
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
};

export type SendOrderEmailResult = {
  emailDelivery: EmailDeliveryStatus;
  detail?: string;
};
