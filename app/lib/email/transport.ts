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

export const SMTP_TLS_MIN_VERSION = "TLSv1.2";

export const SMTP_TRANSPORT_TIMEOUT_MS = {
  connection: 15_000,
  greeting: 15_000,
  socket: 30_000,
} as const;

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
    connectionTimeout: SMTP_TRANSPORT_TIMEOUT_MS.connection,
    greetingTimeout: SMTP_TRANSPORT_TIMEOUT_MS.greeting,
    socketTimeout: SMTP_TRANSPORT_TIMEOUT_MS.socket,
    tls: {
      minVersion: SMTP_TLS_MIN_VERSION,
      servername: config.smtp.host,
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
 * Normalize optional CC list. Empty/omitted → [].
 * Any invalid address fails closed (caller must not send).
 */
export function normalizeOptionalCc(
  cc: string[] | undefined
): { ok: true; cc: string[] } | { ok: false } {
  if (cc == null) return { ok: true, cc: [] };
  if (!Array.isArray(cc)) return { ok: false };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of cc) {
    const addr = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!addr) continue;
    if (!isValidEmail(addr) || addr.length > 254) return { ok: false };
    if (seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
    if (out.length > 20) return { ok: false };
  }
  return { ok: true, cc: out };
}

/**
 * Send mail through a fixed channel identity.
 * From / Reply-To are taken from the channel registry — never from callers.
 * Optional `cc` is validated; omitting it preserves legacy single-recipient behavior.
 */
export async function sendChannelMail(options: {
  channel: EmailChannel;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Optional CC recipients. Omitted/empty = legacy behavior. Invalid → invalid_recipient. */
  cc?: string[];
  attachments?: Attachment[];
  headers?: Record<string, string>;
  messageId?: string;
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

  const envelopeTo = cc.length ? [to, ...cc] : [to];

  try {
    await transporter.sendMail({
      from: config.from,
      replyTo: config.replyTo,
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
