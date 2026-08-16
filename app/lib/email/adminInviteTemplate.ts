import { BRAND_NAME } from "@/app/lib/brand";
import {
  BRAND_INK,
  BRAND_LIME,
  BORDER,
  CARD_BG,
  escapeHtml,
  PAGE_BG,
  renderEmailFooterHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";

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
  const footer = renderEmailFooterHtml("security");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ADMIN_INVITE_EMAIL_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};">
          <tr>
            <td align="center" style="background:${BRAND_LIME};padding:22px 20px;">
              <p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:${BRAND_INK};">
                ${escapeHtml(BRAND_NAME)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
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
              </p>
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    renderEmailFooterText("security"),
  ].join("\n");
}
