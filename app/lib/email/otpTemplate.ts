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

export type OtpEmailKind = "signup" | "password_reset" | "account_deletion";

function copyForKind(kind: OtpEmailKind): {
  subject: string;
  headline: string;
  intro: string;
} {
  if (kind === "password_reset") {
    return {
      subject: `Your ${BRAND_NAME} password reset code`,
      headline: "Password reset code",
      intro: `Use this one-time code to reset your ${BRAND_NAME} password. It expires in 10 minutes.`,
    };
  }
  if (kind === "account_deletion") {
    return {
      subject: `Confirm ${BRAND_NAME} account deletion`,
      headline: "Confirm account deletion",
      intro: `Use this one-time code to confirm deletion of your ${BRAND_NAME} account. It expires in 10 minutes.`,
    };
  }
  return {
    subject: `Verify your ${BRAND_NAME} email`,
    headline: "Verify your email",
    intro: `Welcome to ${BRAND_NAME}. Enter this one-time code to verify your email. It expires in 10 minutes.`,
  };
}

export function renderOtpEmailHtml(options: {
  kind: OtpEmailKind;
  code: string;
  recipientEmail: string;
}): string {
  const copy = copyForKind(options.kind);
  const code = escapeHtml(options.code);
  const email = escapeHtml(options.recipientEmail);
  const footer = renderEmailFooterHtml("security");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${escapeHtml(BRAND_NAME)} verification code expires in 10 minutes.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:${CARD_BG};border:1px solid ${BORDER};">
          <tr>
            <td align="center" style="background:${BRAND_LIME};padding:22px 20px;">
              <p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:0.02em;color:${BRAND_INK};">
                ${escapeHtml(BRAND_NAME)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${TEXT_PRIMARY};font-weight:700;">
                ${escapeHtml(copy.headline)}
              </h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                ${escapeHtml(copy.intro)}
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td align="center" style="background:#f4ffe6;border:1px solid #b8e66b;padding:22px 12px;">
                    <p style="margin:0;font-family:Consolas,Courier New,monospace;font-size:36px;line-height:1.2;letter-spacing:0.28em;font-weight:700;color:${TEXT_PRIMARY};">
                      ${code}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${TEXT_PRIMARY};font-weight:600;">
                This code expires in 10 minutes.
              </p>
              <p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${TEXT_SECONDARY};">
                Sent to ${email}. Ignore this email if you did not request it.
              </p>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
                For your security, ${escapeHtml(BRAND_NAME)} will never ask for your password or installation codes by email.
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

export function renderOtpEmailText(options: {
  kind: OtpEmailKind;
  code: string;
  recipientEmail: string;
}): string {
  const copy = copyForKind(options.kind);
  return [
    BRAND_NAME,
    "",
    copy.headline,
    copy.intro,
    "",
    `Code: ${options.code}`,
    "",
    "This code expires in 10 minutes.",
    `Sent to ${options.recipientEmail}.`,
    "Ignore this email if you did not request it.",
    "",
    renderEmailFooterText("security"),
  ].join("\n");
}

export function otpEmailSubject(kind: OtpEmailKind): string {
  return copyForKind(kind).subject;
}
