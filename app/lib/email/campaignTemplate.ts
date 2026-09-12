/**
 * MAP eSIM branded HTML/text for admin customer campaigns.
 * Display/send rendering only — does not call SMTP or change transactional templates.
 */

import { BRAND_NAME } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
import {
  sanitizeCampaignBody,
  sanitizeCampaignSubject,
} from "@/app/lib/admin/emailCampaignShared";

export function renderCampaignEmailHtml(input: {
  subject: string;
  bodyText: string;
}): string {
  const subject = sanitizeCampaignSubject(input.subject);
  const body = sanitizeCampaignBody(input.bodyText);
  const htmlBody = escapeHtml(body).replace(/\n/g, "<br/>");
  return renderTransactionalEmailLayoutHtml({
    title: subject || BRAND_NAME,
    preheader: subject || undefined,
    bannerLabel: BRAND_NAME,
    contentHtml: `
<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${TEXT_PRIMARY};">${escapeHtml(subject)}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${TEXT_SECONDARY};">${htmlBody}</p>`,
  });
}

export function renderCampaignEmailText(input: {
  subject: string;
  bodyText: string;
}): string {
  const subject = sanitizeCampaignSubject(input.subject);
  const body = sanitizeCampaignBody(input.bodyText);
  return `${subject}\n\n${body}\n\n${renderEmailFooterText()}`;
}
