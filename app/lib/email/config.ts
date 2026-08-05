/**
 * Server-only email configuration. Never import from client components.
 */

import {
  EMAIL_CHANNELS,
  formatChannelFrom,
  formatChannelReplyTo,
  isEmailChannel,
  type EmailChannel,
  type EmailChannelDefinition,
} from "@/app/lib/email/channels";

export type { EmailChannel } from "@/app/lib/email/channels";

export type SmtpTlsMode = {
  secure: boolean;
  /** STARTTLS required (typical for port 587) */
  requireTLS: boolean;
};

export type EmailConfig =
  | { configured: false; channel: EmailChannel; reason: string }
  | {
      configured: true;
      channel: EmailChannel;
      provider: string;
      from: string;
      replyTo: string;
      mailbox: string;
      smtp: {
        host: string;
        port: number;
        user: string;
        password: string;
        secure: boolean;
        requireTLS: boolean;
      };
      definition: EmailChannelDefinition;
    };

function readTrimmed(name: string): string {
  return (process.env[name] ?? "").trim();
}

function normalizeMailbox(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve TLS settings without silently downgrading encryption.
 * - 465 → implicit TLS (secure=true)
 * - 587 → STARTTLS (secure=false, requireTLS=true)
 */
export function resolveSmtpTls(
  port: number,
  secureRaw: string
): { ok: true; tls: SmtpTlsMode } | { ok: false; reason: string } {
  const explicit = secureRaw.trim().toLowerCase();

  if (port === 465) {
    if (explicit === "false" || explicit === "0" || explicit === "no") {
      return {
        ok: false,
        reason: "port_465_requires_secure_tls",
      };
    }
    return { ok: true, tls: { secure: true, requireTLS: false } };
  }

  if (port === 587) {
    if (explicit === "false" || explicit === "0" || explicit === "no") {
      return {
        ok: false,
        reason: "port_587_requires_starttls",
      };
    }
    return { ok: true, tls: { secure: false, requireTLS: true } };
  }

  if (explicit === "true" || explicit === "1" || explicit === "yes") {
    return { ok: true, tls: { secure: true, requireTLS: false } };
  }

  return {
    ok: false,
    reason: "smtp_secure_required_for_port",
  };
}

function sharedSmtpBase():
  | { ok: true; host: string; port: number; tls: SmtpTlsMode; provider: string }
  | { ok: false; reason: string } {
  const provider = readTrimmed("EMAIL_PROVIDER").toLowerCase() || "smtp";
  const host = readTrimmed("SMTP_HOST");
  const portRaw = readTrimmed("SMTP_PORT") || "465";
  const port = Number.parseInt(portRaw, 10);
  const secureRaw = readTrimmed("SMTP_SECURE");

  if (!host) {
    return { ok: false, reason: "missing_smtp_host" };
  }
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, reason: "invalid_smtp_port" };
  }

  const tlsResult = resolveSmtpTls(port, secureRaw || (port === 465 ? "true" : ""));
  if (!tlsResult.ok) {
    return { ok: false, reason: tlsResult.reason };
  }

  return {
    ok: true,
    host,
    port,
    tls: tlsResult.tls,
    provider,
  };
}

/**
 * Load SMTP configuration for a specific transactional channel.
 * Never falls back to another channel's mailbox or credentials.
 */
export function getEmailConfig(channel: EmailChannel): EmailConfig {
  if (!isEmailChannel(channel)) {
    // TypeScript should prevent this; keep a runtime guard.
    return {
      configured: false,
      channel: "support",
      reason: "invalid_channel",
    };
  }

  const definition = EMAIL_CHANNELS[channel];
  const base = sharedSmtpBase();
  if (!base.ok) {
    return { configured: false, channel, reason: base.reason };
  }

  const user = readTrimmed(definition.userEnv);
  const password = readTrimmed(definition.passwordEnv);

  if (!user || !password) {
    return { configured: false, channel, reason: "missing_channel_credentials" };
  }

  if (normalizeMailbox(user) !== normalizeMailbox(definition.mailbox)) {
    return { configured: false, channel, reason: "mailbox_mismatch" };
  }

  return {
    configured: true,
    channel,
    provider: base.provider,
    from: formatChannelFrom(channel),
    replyTo: formatChannelReplyTo(),
    mailbox: definition.mailbox,
    smtp: {
      host: base.host,
      port: base.port,
      user,
      password,
      secure: base.tls.secure,
      requireTLS: base.tls.requireTLS,
    },
    definition,
  };
}

export function isEmailConfigured(channel: EmailChannel): boolean {
  return getEmailConfig(channel).configured;
}

/**
 * Strip CR/LF and control characters from header-related strings.
 */
export function sanitizeEmailHeaderValue(value: string, maxLen = 200): string {
  return value
    .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
