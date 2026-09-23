/**
 * Pure admin email-campaign helpers (offline-QA safe).
 * No Prisma, SMTP, wallet, payment, or VeSIM imports.
 */

export const EMAIL_CAMPAIGN_AUDIENCES = [
  "ALL_CUSTOMERS",
  "PURCHASED_CUSTOMERS",
  "ACTIVE_CUSTOMERS",
] as const;

export type EmailCampaignAudienceId = (typeof EMAIL_CAMPAIGN_AUDIENCES)[number];

export const EMAIL_CAMPAIGN_STATUSES = [
  "DRAFT",
  "TEST_SENT",
  "SENDING",
  "SENT",
  "FAILED",
] as const;

export const EMAIL_CAMPAIGN_RECIPIENT_STATUSES = [
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
] as const;

/** Exact confirm phrase required before a bulk customer send. */
export const EMAIL_CAMPAIGN_CONFIRM_PHRASE = "SEND CUSTOMER CAMPAIGN";

export const EMAIL_CAMPAIGN_SUBJECT_MAX = 160;
export const EMAIL_CAMPAIGN_BODY_MAX = 20_000;
export const EMAIL_CAMPAIGN_SEND_BATCH = 20;
/** Default pause between SMTP batches (ms). Override with EMAIL_CAMPAIGN_BATCH_DELAY_MS. */
export const EMAIL_CAMPAIGN_BATCH_DELAY_MS_DEFAULT = 2_000;
export const EMAIL_CAMPAIGN_BATCH_DELAY_MS_MAX = 60_000;
/** Max batches processed in one server action invocation (queue continues client-side). */
export const EMAIL_CAMPAIGN_MAX_BATCHES_PER_RUN = 5;
export const EMAIL_CAMPAIGN_HISTORY_LIMIT = 50;
export const EMAIL_CAMPAIGN_LOG_LIMIT = 80;

/** Exact confirm phrase required before resending failed recipients. */
export const EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE = "RESEND FAILED EMAILS";

export const EMAIL_CAMPAIGN_CHANNEL = "support" as const;

/**
 * Configurable inter-batch delay for SMTP rate limits.
 * Pass process.env.EMAIL_CAMPAIGN_BATCH_DELAY_MS from server code.
 * Invalid / omitted → default. Clamped to 0…EMAIL_CAMPAIGN_BATCH_DELAY_MS_MAX.
 */
export function resolveEmailCampaignBatchDelayMs(
  raw: string | null | undefined
): number {
  const value = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(value) || value < 0) {
    return EMAIL_CAMPAIGN_BATCH_DELAY_MS_DEFAULT;
  }
  return Math.min(value, EMAIL_CAMPAIGN_BATCH_DELAY_MS_MAX);
}

export function parseEmailCampaignAudience(
  raw: string | null | undefined
): EmailCampaignAudienceId | null {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  return (EMAIL_CAMPAIGN_AUDIENCES as readonly string[]).includes(value)
    ? (value as EmailCampaignAudienceId)
    : null;
}

export const EMAIL_CAMPAIGN_AUDIENCE_HELP: Record<
  EmailCampaignAudienceId,
  string
> = {
  ALL_CUSTOMERS: "Every customer account with a valid email (not deleted).",
  PURCHASED_CUSTOMERS:
    "Customers with at least one completed purchase.",
  ACTIVE_CUSTOMERS: "Verified customers who are not blocked.",
};

/**
 * Parse a single controlled test inbox (EMAIL_TEST_RECIPIENT).
 * Rejects lists, invalid shapes, and @example.com. Never logs the value.
 */
export function parseEmailCampaignTestRecipient(
  raw: string | null | undefined
): string | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value || value.length > 254) return null;
  if (value.includes(",") || value.includes(";") || /\s/.test(value)) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  const domain = value.split("@")[1] || "";
  if (domain === "example.com" || domain.endsWith(".example")) return null;
  return value;
}

/**
 * Resolve campaign test-send destination.
 * Prefer EMAIL_TEST_RECIPIENT when set; otherwise form value, then fallback.
 */
export function resolveEmailCampaignTestRecipient(options: {
  envValue?: string | null;
  formValue?: string | null;
  fallbackEmail?: string | null;
}): string | null {
  return (
    parseEmailCampaignTestRecipient(options.envValue) ??
    parseEmailCampaignTestRecipient(options.formValue) ??
    parseEmailCampaignTestRecipient(options.fallbackEmail)
  );
}

export function emailCampaignAudienceLabel(
  audience: string | null | undefined
): string {
  switch (String(audience ?? "").trim()) {
    case "ALL_CUSTOMERS":
      return "All customers";
    case "PURCHASED_CUSTOMERS":
      return "Purchased customers";
    case "ACTIVE_CUSTOMERS":
      return "Active customers";
    default:
      return "Unknown audience";
  }
}

export function emailCampaignStatusLabel(
  status: string | null | undefined
): string {
  switch (String(status ?? "").trim()) {
    case "DRAFT":
      return "Draft";
    case "TEST_SENT":
      return "Test sent";
    case "SENDING":
      return "Sending";
    case "SENT":
      return "Sent";
    case "FAILED":
      return "Failed";
    default:
      return "Unknown";
  }
}

export function emailCampaignRecipientStatusLabel(
  status: string | null | undefined
): string {
  switch (String(status ?? "").trim()) {
    case "PENDING":
      return "Pending";
    case "SENT":
      return "Sent";
    case "FAILED":
      return "Failed";
    case "SKIPPED":
      return "Skipped";
    default:
      return "Unknown";
  }
}

export function sanitizeCampaignSubject(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EMAIL_CAMPAIGN_SUBJECT_MAX);
}

export function sanitizeCampaignBody(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, EMAIL_CAMPAIGN_BODY_MAX);
}

export function campaignConfirmPhraseMatches(
  raw: string | null | undefined
): boolean {
  return String(raw ?? "").trim() === EMAIL_CAMPAIGN_CONFIRM_PHRASE;
}

export function campaignCanStartBulkSend(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim();
  return value === "DRAFT" || value === "TEST_SENT";
}

export function campaignCanContinueBulkSend(
  status: string | null | undefined
): boolean {
  return String(status ?? "").trim() === "SENDING";
}

/**
 * Resend Failed is available after a bulk run finished with failures.
 * Does not apply to draft/test campaigns (no recipient rows yet).
 */
export function campaignCanResendFailed(
  status: string | null | undefined,
  failedCount: number
): boolean {
  if (!Number.isFinite(failedCount) || failedCount <= 0) return false;
  const value = String(status ?? "").trim();
  return value === "SENT" || value === "FAILED";
}

export function campaignResendFailedPhraseMatches(
  raw: string | null | undefined
): boolean {
  return String(raw ?? "").trim() === EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE;
}

/** Reusable campaign HTML layouts. CLASSIC is legacy-only (not in selector). */
export const EMAIL_CAMPAIGN_TEMPLATE_KEYS = [
  "ANNOUNCEMENT",
  "OFFER",
  "ALERT",
  "TRAVEL_PROMOTION",
  "DISCOUNT_PROMO",
  "FEATURE_UPDATE",
  "WELCOME",
  "MAINTENANCE_ALERT",
  "CLASSIC",
] as const;

export type EmailCampaignTemplateKey =
  (typeof EMAIL_CAMPAIGN_TEMPLATE_KEYS)[number];

/** Templates offered in the create-campaign selector. */
export const EMAIL_CAMPAIGN_SELECTABLE_TEMPLATES = [
  "ANNOUNCEMENT",
  "OFFER",
  "ALERT",
  "TRAVEL_PROMOTION",
  "DISCOUNT_PROMO",
  "FEATURE_UPDATE",
  "WELCOME",
  "MAINTENANCE_ALERT",
] as const satisfies readonly EmailCampaignTemplateKey[];

export type EmailCampaignTemplatePreset = {
  key: EmailCampaignTemplateKey;
  label: string;
  description: string;
  defaultSubject: string;
  defaultBody: string;
};

export const EMAIL_CAMPAIGN_TEMPLATE_PRESETS: Record<
  EmailCampaignTemplateKey,
  EmailCampaignTemplatePreset
> = {
  ANNOUNCEMENT: {
    key: "ANNOUNCEMENT",
    label: "Simple Announcement",
    description: "Clean brand update for news, launches, and general notices.",
    defaultSubject: "A quick update from MAP eSIM",
    defaultBody:
      "Hi,\n\nWe have a short update for you.\n\n[Share your announcement here.]\n\nThank you for traveling with MAP eSIM.",
  },
  OFFER: {
    key: "OFFER",
    label: "Offer / Discount",
    description: "Promo-focused layout with a clear call-to-action to buy eSIM.",
    defaultSubject: "Limited-time eSIM offer from MAP eSIM",
    defaultBody:
      "Hi,\n\nFor a limited time, enjoy a special offer on selected eSIM plans.\n\nOffer details: [describe discount or promo]\nValid until: [date]\n\nOpen MAP eSIM to browse destinations and claim your plan while the offer lasts.",
  },
  ALERT: {
    key: "ALERT",
    label: "Alert / Important Update",
    description: "High-visibility layout for service notices and important changes.",
    defaultSubject: "Important update from MAP eSIM",
    defaultBody:
      "Hi,\n\nThis is an important update about your MAP eSIM service.\n\n[Explain what changed and what customers should do.]\n\nIf you need help, reply to this email or contact support@mapesim.com.",
  },
  TRAVEL_PROMOTION: {
    key: "TRAVEL_PROMOTION",
    label: "Travel Promotion",
    description: "Destination-focused promo for upcoming trips and travel seasons.",
    defaultSubject: "Get travel-ready with MAP eSIM",
    defaultBody:
      "Hi,\n\nPlanning a trip? Stay online from the moment you land with MAP eSIM.\n\nDestination: [country or region]\nSuggested plan: [data / days]\n\nBrowse destinations, buy in minutes, and install by QR before you fly.",
  },
  DISCOUNT_PROMO: {
    key: "DISCOUNT_PROMO",
    label: "Discount / Promo",
    description: "Sale-style layout for coupon codes and time-limited discounts.",
    defaultSubject: "Your MAP eSIM discount is waiting",
    defaultBody:
      "Hi,\n\nEnjoy a special discount on selected MAP eSIM plans.\n\nPromo code: [CODE]\nDiscount: [e.g. 10% off]\nValid until: [date]\n\nApply your code at checkout and stay connected for less.",
  },
  FEATURE_UPDATE: {
    key: "FEATURE_UPDATE",
    label: "Feature Update",
    description: "Product news layout for new features and improvements.",
    defaultSubject: "What's new at MAP eSIM",
    defaultBody:
      "Hi,\n\nWe've improved MAP eSIM to make travel connectivity even easier.\n\nWhat's new:\n• [Feature 1]\n• [Feature 2]\n• [Feature 3]\n\nOpen the site or app to try the update on your next trip.",
  },
  WELCOME: {
    key: "WELCOME",
    label: "Welcome Email",
    description: "Warm onboarding layout for new customers.",
    defaultSubject: "Welcome to MAP eSIM",
    defaultBody:
      "Hi,\n\nWelcome to MAP eSIM — we're glad you're here.\n\nHere's how to get started:\n1. Choose a destination\n2. Buy a data plan\n3. Install by QR and connect\n\nIf you need help at any step, contact support@mapesim.com.",
  },
  MAINTENANCE_ALERT: {
    key: "MAINTENANCE_ALERT",
    label: "Maintenance Alert",
    description: "Service notice layout for planned maintenance and downtime.",
    defaultSubject: "Scheduled maintenance notice from MAP eSIM",
    defaultBody:
      "Hi,\n\nWe have scheduled maintenance that may briefly affect MAP eSIM services.\n\nWhen: [date / time and timezone]\nExpected impact: [what customers may notice]\n\nWe will restore full service as soon as maintenance is complete. Thank you for your patience.",
  },
  CLASSIC: {
    key: "CLASSIC",
    label: "Classic travel promo",
    description: "Original campaign layout with travel hero and feature cards.",
    defaultSubject: "Stay connected wherever you go",
    defaultBody:
      "Hi,\n\nExplore MAP eSIM destinations and get connected before you travel.\n\nBrowse plans and install by QR in minutes.",
  },
};

export function parseEmailCampaignTemplateKey(
  raw: string | null | undefined
): EmailCampaignTemplateKey {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  return (EMAIL_CAMPAIGN_TEMPLATE_KEYS as readonly string[]).includes(value)
    ? (value as EmailCampaignTemplateKey)
    : "CLASSIC";
}

export function emailCampaignTemplateLabel(
  key: string | null | undefined
): string {
  const parsed = parseEmailCampaignTemplateKey(key);
  return EMAIL_CAMPAIGN_TEMPLATE_PRESETS[parsed].label;
}
