/**
 * Server-only alert notification email delivery (Part B2).
 * Support channel only. Never logs recipients, secrets, or raw SMTP errors.
 */
import "server-only";

import { randomBytes } from "node:crypto";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import { sendChannelMail } from "@/app/lib/email/transport";
import { getPublicAppBaseUrl } from "@/app/lib/email/activation";
import { BRAND_NAME } from "@/app/lib/brand";
import {
  buildDeterministicMessageId,
  buildSafeAdminAlertUrl,
  evidenceSafeAlertSummary,
  maskInternalReference,
  normalizeOpaqueErrorCode,
  parseAlertNotificationRecipients,
  sanitizeSourceType,
  type AlertNotificationErrorCode,
  type AlertNotificationEventType,
} from "@/app/lib/admin/alertNotificationShared";
import type { MonitoringAlert } from "@/app/lib/admin/monitoringAlertShared";

export function loadAlertNotificationRecipientsFromEnv():
  | { ok: true; recipients: string[] }
  | { ok: false; errorCode: "invalid_recipients" } {
  return parseAlertNotificationRecipients(
    process.env.ALERT_NOTIFICATION_RECIPIENTS
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildAlertNotificationEmail(input: {
  alert: MonitoringAlert;
  eventType: AlertNotificationEventType;
  checkedAt: Date;
  sourceType: string | null;
  sourceRecordRef: string | null;
}): { subject: string; text: string; html: string } {
  const eventLabel =
    input.eventType === "INITIAL"
      ? "Active"
      : input.eventType === "REMINDER"
        ? "Reminder"
        : "Resolved";
  const subject = sanitizeEmailHeaderValue(
    `[${BRAND_NAME} Alerts] ${eventLabel}: ${input.alert.severity} ${input.alert.code}`,
    180
  );
  // Prefer Auth.js URL, then the shared public app base helper. Omit if not
  // a validated https://mapesim.com origin (never localhost invent).
  const link = buildSafeAdminAlertUrl(
    process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      getPublicAppBaseUrl()
  );
  const summary = evidenceSafeAlertSummary(input.alert);
  const sourceType = sanitizeSourceType(input.sourceType) ?? "—";
  const sourceRef = maskInternalReference(input.sourceRecordRef) ?? "—";
  const checked = input.checkedAt.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");

  const textLines = [
    `${BRAND_NAME} operational alert notification`,
    "",
    `Event: ${eventLabel}`,
    `Severity: ${input.alert.severity}`,
    `Category: ${input.alert.category}`,
    `Alert code: ${input.alert.code}`,
    `Checked at: ${checked}`,
    `Source type: ${sourceType}`,
    `Source reference: ${sourceRef}`,
    "",
    `Summary: ${summary}`,
  ];
  if (link) {
    textLines.push("", `Admin alerts: ${link}`);
  }
  textLines.push(
    "",
    "This message contains evidence-safe operational fields only.",
    "Do not treat this as provider failure unless the alert code and evidence support it."
  );

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.45;color:#111">
<p><strong>${escapeHtml(BRAND_NAME)} operational alert notification</strong></p>
<ul>
<li>Event: ${escapeHtml(eventLabel)}</li>
<li>Severity: ${escapeHtml(input.alert.severity)}</li>
<li>Category: ${escapeHtml(input.alert.category)}</li>
<li>Alert code: ${escapeHtml(input.alert.code)}</li>
<li>Checked at: ${escapeHtml(checked)}</li>
<li>Source type: ${escapeHtml(sourceType)}</li>
<li>Source reference: ${escapeHtml(sourceRef)}</li>
</ul>
<p>${escapeHtml(summary)}</p>
${link ? `<p><a href="${escapeHtml(link)}">Open admin alerts</a></p>` : ""}
<p style="font-size:12px;color:#555">Evidence-safe operational fields only. Do not treat this as provider failure unless the alert code and evidence support it.</p>
</body></html>`;

  return { subject: subject || `${BRAND_NAME} alert`, text: textLines.join("\n"), html };
}

export async function sendAlertNotificationEmails(input: {
  alert: MonitoringAlert;
  eventType: AlertNotificationEventType;
  checkedAt: Date;
  sourceType: string | null;
  sourceRecordRef: string | null;
  eventKey: string;
  recipients: string[];
}): Promise<
  | { ok: true; messageId: string }
  | { ok: false; errorCode: AlertNotificationErrorCode }
> {
  if (!isEmailConfigured("support")) {
    return { ok: false, errorCode: "not_configured" };
  }
  if (!input.recipients.length) {
    return { ok: false, errorCode: "invalid_recipients" };
  }

  const content = buildAlertNotificationEmail(input);
  const messageId = buildDeterministicMessageId(input.eventKey);

  // SMTP cannot guarantee perfect exactly-once if the process crashes after
  // the provider accepts the message but before durable SENT is recorded.
  // Unique eventKey + CAS claim minimize normal concurrent/restart duplication.
  for (const to of input.recipients) {
    const result = await sendChannelMail({
      channel: "support",
      to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      messageId,
      headers: {
        "X-MAP-ESIM-Alert-Event": input.eventType,
        "X-MAP-ESIM-Alert-Code": String(input.alert.code).slice(0, 80),
      },
    });
    if (!result.ok) {
      return {
        ok: false,
        errorCode: normalizeOpaqueErrorCode(result.reason),
      };
    }
  }

  return { ok: true, messageId };
}

export function newClaimToken(): string {
  return randomBytes(16).toString("hex");
}
