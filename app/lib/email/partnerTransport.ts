/**
 * Nodemailer send helper for partneresim.com channels.
 * Separate cache from retail transport.ts — never imports retail sendChannelMail for identity.
 */

import nodemailer, { type Transporter } from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer";
import {
  getPartnerEmailConfig,
} from "@/app/lib/email/partnerEmailConfig";
import type { PartnerEmailChannel } from "@/app/lib/email/partnerChannels";
import { sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import { EMAIL_LOGO_CID, getEmailLogoAttachment } from "@/app/lib/email/logo";
import { isValidEmail } from "@/app/lib/email/isValidEmail";
import {
  normalizeOptionalCc,
  sanitizeSmtpFailureDetail,
  SMTP_TLS_MIN_VERSION,
  SMTP_TRANSPORT_TIMEOUT_MS,
  type SendChannelMailResult,
} from "@/app/lib/email/transport";

type CachedTransporter = {
  fingerprint: string;
  transporter: Transporter;
};

const partnerTransporterCache = new Map<
  PartnerEmailChannel,
  CachedTransporter
>();

function fingerprintFor(channel: PartnerEmailChannel): string | null {
  const config = getPartnerEmailConfig(channel);
  if (!config.configured) return null;
  return [
    config.smtp.host,
    config.smtp.port,
    config.smtp.secure ? "1" : "0",
    config.smtp.requireTLS ? "1" : "0",
    config.smtp.user,
    `p${config.smtp.password.length}`,
    config.mailbox,
  ].join("|");
}

export function getPartnerChannelTransporter(
  channel: PartnerEmailChannel
): Transporter | null {
  const config = getPartnerEmailConfig(channel);
  if (!config.configured) return null;

  const fingerprint = fingerprintFor(channel);
  if (!fingerprint) return null;

  const cached = partnerTransporterCache.get(channel);
  if (cached && cached.fingerprint === fingerprint) {
    return cached.transporter;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: config.smtp.requireTLS || undefined,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password,
    },
    connectionTimeout: SMTP_TRANSPORT_TIMEOUT_MS.connection,
    greetingTimeout: SMTP_TRANSPORT_TIMEOUT_MS.greeting,
    socketTimeout: SMTP_TRANSPORT_TIMEOUT_MS.socket,
    tls: {
      minVersion: SMTP_TLS_MIN_VERSION,
      servername: config.smtp.host,
    },
  });

  partnerTransporterCache.set(channel, { fingerprint, transporter });
  return transporter;
}

/**
 * Send mail via a partneresim.com channel identity.
 * From / Reply-To come from partner channel registry (never caller-controlled),
 * except optional `replyToOverride` for inbound forms (applicant email).
 */
export async function sendPartnerChannelMail(options: {
  channel: PartnerEmailChannel;
  to: string;
  subject: string;
  text: string;
  html: string;
  cc?: string[];
  attachments?: Attachment[];
  headers?: Record<string, string>;
  messageId?: string;
  /** Inbound forms only — e.g. applicant business email. */
  replyToOverride?: string;
}): Promise<SendChannelMailResult> {
  const to = options.to.trim();
  if (!to || !isValidEmail(to)) {
    return { ok: false, reason: "invalid_recipient" };
  }

  const ccParsed = normalizeOptionalCc(options.cc);
  if (!ccParsed.ok) {
    return { ok: false, reason: "invalid_recipient" };
  }
  const cc = ccParsed.cc.filter((addr) => addr !== to.toLowerCase());

  const config = getPartnerEmailConfig(options.channel);
  if (!config.configured) {
    console.error(
      `Partner email skipped: channel "${options.channel}" is not configured`
    );
    return { ok: false, reason: "not_configured" };
  }

  const transporter = getPartnerChannelTransporter(options.channel);
  if (!transporter) {
    return { ok: false, reason: "not_configured" };
  }

  const subject = sanitizeEmailHeaderValue(options.subject, 180);
  if (!subject) {
    return { ok: false, reason: "send_failed" };
  }

  const replyTo =
    options.replyToOverride && isValidEmail(options.replyToOverride.trim())
      ? options.replyToOverride.trim()
      : config.replyTo;

  const logo = getEmailLogoAttachment();
  const extra = options.attachments || [];
  const attachments = [
    ...(logo ? [logo] : []),
    ...extra.filter((item) => item.cid !== EMAIL_LOGO_CID),
  ];

  const envelopeTo = cc.length ? [to, ...cc] : [to];

  try {
    const info = await transporter.sendMail({
      from: config.from,
      replyTo,
      to,
      ...(cc.length ? { cc } : {}),
      subject,
      text: options.text,
      html: options.html,
      attachments: attachments.length ? attachments : undefined,
      headers: options.headers,
      messageId: options.messageId,
      envelope: {
        from: config.mailbox,
        to: envelopeTo,
      },
    });
    const messageId =
      typeof info?.messageId === "string" && info.messageId.trim()
        ? info.messageId.trim().slice(0, 200)
        : undefined;
    return { ok: true, messageId };
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
        ? String((error as { code: string }).code).slice(0, 64)
        : "";
    const detail = sanitizeSmtpFailureDetail(code);
    console.error(
      `Partner email send failed for channel "${options.channel}"${
        code ? ` code=${code}` : ""
      }`
    );
    return { ok: false, reason: "send_failed", detail };
  }
}

export function clearPartnerTransporterCache(): void {
  for (const [channel, cached] of partnerTransporterCache) {
    partnerTransporterCache.delete(channel);
    try {
      cached.transporter.close();
    } catch {
      /* ignore */
    }
  }
}
