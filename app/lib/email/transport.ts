/**
 * Server-only Nodemailer transport cache and channel send helper.
 * Never import from client components.
 */

import nodemailer, { type Transporter } from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer";
import {
  getEmailConfig,
  sanitizeEmailHeaderValue,
  type EmailChannel,
} from "@/app/lib/email/config";
import { EMAIL_LOGO_CID, getEmailLogoAttachment } from "@/app/lib/email/logo";
import { isValidEmail } from "@/app/lib/email/isValidEmail";

type CachedTransporter = {
  fingerprint: string;
  transporter: Transporter;
};

const transporterCache = new Map<EmailChannel, CachedTransporter>();

function fingerprintFor(channel: EmailChannel): string | null {
  const config = getEmailConfig(channel);
  if (!config.configured) return null;
  // Do not include password in logs; fingerprint is process-local only.
  return [
    config.smtp.host,
    config.smtp.port,
    config.smtp.secure ? "1" : "0",
    config.smtp.requireTLS ? "1" : "0",
    config.smtp.user,
    // Length-only marker so password rotation invalidates cache without storing secret.
    `p${config.smtp.password.length}`,
  ].join("|");
}

export function getChannelTransporter(
  channel: EmailChannel
): Transporter | null {
  const config = getEmailConfig(channel);
  if (!config.configured) return null;

  const fingerprint = fingerprintFor(channel);
  if (!fingerprint) return null;

  const cached = transporterCache.get(channel);
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
  });

  transporterCache.set(channel, { fingerprint, transporter });
  return transporter;
}

export type SendChannelMailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "send_failed" | "invalid_recipient";
    };

/**
 * Send mail through a fixed channel identity.
 * From / Reply-To are taken from the channel registry — never from callers.
 */
export async function sendChannelMail(options: {
  channel: EmailChannel;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
  messageId?: string;
}): Promise<SendChannelMailResult> {
  const to = options.to.trim();
  if (!to || !isValidEmail(to)) {
    return { ok: false, reason: "invalid_recipient" };
  }

  const config = getEmailConfig(options.channel);
  if (!config.configured) {
    console.error(
      `Email skipped: channel "${options.channel}" is not configured`
    );
    return { ok: false, reason: "not_configured" };
  }

  const transporter = getChannelTransporter(options.channel);
  if (!transporter) {
    return { ok: false, reason: "not_configured" };
  }

  const subject = sanitizeEmailHeaderValue(options.subject, 180);
  if (!subject) {
    return { ok: false, reason: "send_failed" };
  }

  const logo = getEmailLogoAttachment();
  const extra = options.attachments || [];
  // Keep logo CID unique; never collide with order QR CID attachments.
  const attachments = [
    ...(logo ? [logo] : []),
    ...extra.filter((item) => item.cid !== EMAIL_LOGO_CID),
  ];

  try {
    await transporter.sendMail({
      from: config.from,
      replyTo: config.replyTo,
      to,
      subject,
      text: options.text,
      html: options.html,
      attachments: attachments.length ? attachments : undefined,
      headers: options.headers,
      messageId: options.messageId,
      envelope: {
        from: config.mailbox,
        to,
      },
    });
    return { ok: true };
  } catch {
    console.error(`Email send failed for channel "${options.channel}"`);
    return { ok: false, reason: "send_failed" };
  }
}

/** Test helper — clears cached transporters (does not log secrets). */
export function clearTransporterCache(): void {
  transporterCache.clear();
}
