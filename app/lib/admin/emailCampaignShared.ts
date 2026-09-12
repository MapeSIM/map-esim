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
export const EMAIL_CAMPAIGN_HISTORY_LIMIT = 50;
export const EMAIL_CAMPAIGN_LOG_LIMIT = 80;

export const EMAIL_CAMPAIGN_CHANNEL = "support" as const;

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
