import { BRAND_NAME } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

export function renderPasswordChangedEmailHtml(recipientEmail: string): string {
  const email = escapeHtml(recipientEmail);

  return renderTransactionalEmailLayoutHtml({
    title: `Your ${BRAND_NAME} password was changed`,
    contentHtml: `
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                Password changed
              </h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                The password for ${email} was changed successfully.
              </p>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};">
                If you did not make this change, reset your password immediately and contact support.
              </p>`,
  });
}

export function renderPasswordChangedEmailText(recipientEmail: string): string {
  return [
    BRAND_NAME,
    "",
    "Password changed",
    `The password for ${recipientEmail} was changed successfully.`,
    "If you did not make this change, reset your password immediately and contact support.",
    "",
    renderEmailFooterText(),
  ].join("\n");
}

export function renderAccountDeletedEmailHtml(recipientEmail: string): string {
  const email = escapeHtml(recipientEmail);

  return renderTransactionalEmailLayoutHtml({
    title: `Your ${BRAND_NAME} account was deleted`,
    contentHtml: `
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                Account deleted
              </h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                The ${escapeHtml(BRAND_NAME)} account for ${email} has been permanently deleted.
              </p>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};">
                Past eSIM purchases remain available through your original secure order links. If you did not request this, contact support immediately.
              </p>`,
  });
}

export function renderAccountDeletedEmailText(recipientEmail: string): string {
  return [
    BRAND_NAME,
    "",
    "Account deleted",
    `The ${BRAND_NAME} account for ${recipientEmail} has been permanently deleted.`,
    "Past eSIM purchases remain available through your original secure order links. If you did not request this, contact support immediately.",
    "",
    renderEmailFooterText(),
  ].join("\n");
}
