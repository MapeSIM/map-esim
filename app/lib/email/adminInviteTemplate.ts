import { BRAND_NAME } from "@/app/lib/brand";
import {
  BRAND_INK,
  BRAND_LIME,
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

export const ADMIN_INVITE_EMAIL_SUBJECT = `Set up your ${BRAND_NAME} Admin account`;

function ctaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 16px;">
      <tr>
        <td align="center" bgcolor="${BRAND_LIME}" style="border-radius:10px;background-color:${BRAND_LIME};border:1px solid ${BRAND_LIME};">
          <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 22px;color:${BRAND_INK};font-size:14px;font-weight:700;text-decoration:none;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

export function renderAdminInviteEmailHtml(options: {
  recipientEmail: string;
  setupUrl: string;
}): string {
  const email = escapeHtml(options.recipientEmail);

  return renderTransactionalEmailLayoutHtml({
    title: ADMIN_INVITE_EMAIL_SUBJECT,
    contentHtml: `
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                Create your administrator password
              </h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                You have been invited as a ${escapeHtml(BRAND_NAME)} administrator.
              </p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Use the secure link below to create your password.
              </p>
              ${ctaButton(options.setupUrl, "Create password")}
              <p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
                This link expires in 30 minutes.
              </p>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
                If the link expires, contact the administrator to resend the setup link.
              </p>
              <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
                Sent to ${email}.
              </p>`,
  });
}

export function renderAdminInviteEmailText(options: {
  recipientEmail: string;
  setupUrl: string;
}): string {
  return [
    BRAND_NAME,
    "",
    `You have been invited as a ${BRAND_NAME} administrator.`,
    "Use the secure link below to create your password.",
    "",
    "Create password:",
    options.setupUrl,
    "",
    "This link expires in 30 minutes.",
    "If the link expires, contact the administrator to resend the setup link.",
    "",
    `Sent to ${options.recipientEmail}.`,
    "",
    renderEmailFooterText(),
  ].join("\n");
}
