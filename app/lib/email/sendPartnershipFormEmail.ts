import "server-only";

import { BRAND_NAME, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
import {
  getEmailConfig,
  sanitizeEmailHeaderValue,
} from "@/app/lib/email/config";
import { getEmailLogoAttachment } from "@/app/lib/email/logo";
import { getChannelTransporter } from "@/app/lib/email/transport";
import { partnershipVolumeLabel } from "@/app/lib/partnerships/partnershipLimits";
import { isValidEmail } from "@/app/lib/vesim/server";

export type SendPartnershipFormEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "send_failed" | "invalid_reply_to";
    };

export type PartnershipApplicationPayload = {
  fullName: string;
  companyName: string;
  registrationNumber: string;
  businessEmail: string;
  phone: string;
  country: string;
  postalCode: string;
  website: string;
  about: string;
  expectedVolume: string;
};

/**
 * Inbound partnership application → SUPPORT mailbox.
 * Reply-To is the validated business email only.
 */
export async function sendPartnershipFormEmail(
  options: PartnershipApplicationPayload
): Promise<SendPartnershipFormEmailResult> {
  const replyTo = options.businessEmail.trim().toLowerCase();
  if (!replyTo || !isValidEmail(replyTo)) {
    return { ok: false, reason: "invalid_reply_to" };
  }

  const fullName = sanitizeEmailHeaderValue(options.fullName, 80);
  const companyName = sanitizeEmailHeaderValue(options.companyName, 120);
  const phone = sanitizeEmailHeaderValue(options.phone, 32);
  const country = sanitizeEmailHeaderValue(options.country, 80);
  const postalCode = sanitizeEmailHeaderValue(options.postalCode, 24);
  const registrationNumber = sanitizeEmailHeaderValue(
    options.registrationNumber || "—",
    80
  );
  const website = sanitizeEmailHeaderValue(options.website || "—", 200);
  const volume = sanitizeEmailHeaderValue(
    partnershipVolumeLabel(options.expectedVolume),
    80
  );
  const about = options.about
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();

  if (!fullName || !companyName || !phone || !country || !postalCode || !about) {
    return { ok: false, reason: "send_failed" };
  }

  const config = getEmailConfig("support");
  if (!config.configured) {
    return { ok: false, reason: "not_configured" };
  }

  const transporter = getChannelTransporter("support");
  if (!transporter) {
    return { ok: false, reason: "not_configured" };
  }

  const to = BRAND_SUPPORT_EMAIL.trim().toLowerCase();
  if (!to || !isValidEmail(to)) {
    return { ok: false, reason: "send_failed" };
  }

  const subject = sanitizeEmailHeaderValue(
    `Partnership application — ${companyName}`,
    160
  );

  const text = [
    `New partnership application via ${BRAND_NAME}`,
    "",
    `Full name: ${fullName}`,
    `Company: ${companyName}`,
    `Registration number: ${registrationNumber}`,
    `Business email: ${replyTo}`,
    `Phone: ${phone}`,
    `Country: ${country}`,
    `ZIP / postal code: ${postalCode}`,
    `Website / social: ${website}`,
    `Expected monthly volume: ${volume}`,
    "",
    "About the business / audience:",
    about,
    "",
    renderEmailFooterText(),
  ].join("\n");

  const html = renderTransactionalEmailLayoutHtml({
    title: subject,
    contentHtml: `
              <h1 style="margin:0 0 12px;font-size:20px;color:${TEXT_PRIMARY};">Partnership application</h1>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${TEXT_SECONDARY};">
                A new Affiliates &amp; Partnerships application was submitted on the website.
              </p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Full name:</strong> ${escapeHtml(fullName)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Company:</strong> ${escapeHtml(companyName)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Registration:</strong> ${escapeHtml(registrationNumber)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Email:</strong> ${escapeHtml(replyTo)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Country:</strong> ${escapeHtml(country)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Postal code:</strong> ${escapeHtml(postalCode)}</p>
              <p style="margin:0 0 8px;font-size:14px;"><strong>Website / social:</strong> ${escapeHtml(website)}</p>
              <p style="margin:0 0 16px;font-size:14px;"><strong>Expected volume:</strong> ${escapeHtml(volume)}</p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;">About</p>
              <p style="margin:0;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(about)}</p>`,
  });

  try {
    const logo = getEmailLogoAttachment();
    await transporter.sendMail({
      from: config.from,
      to,
      replyTo,
      subject: `[MAP eSIM Partnerships] ${subject}`,
      text,
      html,
      attachments: logo ? [logo] : undefined,
      headers: {
        "X-MAP-ESIM-Form": "partnership_application",
      },
    });
    return { ok: true };
  } catch {
    console.error("partnership_form_email", "send_failed");
    return { ok: false, reason: "send_failed" };
  }
}
