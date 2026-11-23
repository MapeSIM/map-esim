/**
 * B2B partner SMTP config with clean fallback to retail SMTP_* when
 * PARTNER_SMTP_* is not fully set. Does not mutate retail channels.
 */

import {
  formatPartnerChannelFrom,
  formatPartnerReplyTo,
  getPartnerChannelDefinition,
  type PartnerEmailChannel,
  type PartnerEmailChannelDefinition,
} from "@/app/lib/email/partnerChannels";
import { resolveSmtpTls, type SmtpTlsMode } from "@/app/lib/email/config";

export type PartnerEmailConfig =
  | { configured: false; channel: PartnerEmailChannel; reason: string }
  | {
      configured: true;
      channel: PartnerEmailChannel;
      from: string;
      replyTo: string;
      mailbox: string;
      /** True when using PARTNER_SMTP_*; false when falling back to retail SMTP_*. */
      usingPartnerSmtp: boolean;
      smtp: {
        host: string;
        port: number;
        user: string;
        password: string;
        secure: boolean;
        requireTLS: boolean;
      };
      definition: PartnerEmailChannelDefinition;
    };

function readTrimmed(name: string): string {
  return (process.env[name] ?? "").trim();
}

function partnerSharedSmtpBase():
  | {
      ok: true;
      host: string;
      port: number;
      tls: SmtpTlsMode;
      usingPartnerSmtp: boolean;
    }
  | { ok: false; reason: string } {
  const partnerHost = readTrimmed("PARTNER_SMTP_HOST");
  if (partnerHost) {
    const portRaw = readTrimmed("PARTNER_SMTP_PORT") || "465";
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port <= 0) {
      return { ok: false, reason: "partner_smtp_port_invalid" };
    }
    const tls = resolveSmtpTls(port, readTrimmed("PARTNER_SMTP_SECURE"));
    if (!tls.ok) return { ok: false, reason: tls.reason };
    return {
      ok: true,
      host: partnerHost,
      port,
      tls: tls.tls,
      usingPartnerSmtp: true,
    };
  }

  // Fallback: retail shared SMTP host (retail customer channels untouched).
  const host = readTrimmed("SMTP_HOST");
  if (!host) return { ok: false, reason: "smtp_host_missing" };
  const portRaw = readTrimmed("SMTP_PORT") || "465";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    return { ok: false, reason: "smtp_port_invalid" };
  }
  const tls = resolveSmtpTls(port, readTrimmed("SMTP_SECURE"));
  if (!tls.ok) return { ok: false, reason: tls.reason };
  return {
    ok: true,
    host,
    port,
    tls: tls.tls,
    usingPartnerSmtp: false,
  };
}

/**
 * Resolve auth for a partner channel:
 * 1) per-channel PARTNER_SMTP_*_USER/PASSWORD
 * 2) shared PARTNER_SMTP_USER/PASSWORD
 * 3) when falling back to retail host: map channel → nearest retail mailbox
 *    (partners/noreply → support, security → security, billing → billing, api → support)
 */
function resolveAuth(
  channel: PartnerEmailChannel,
  usingPartnerSmtp: boolean
): { user: string; password: string } | null {
  const def = getPartnerChannelDefinition(channel);
  const channelUser = readTrimmed(def.userEnv);
  const channelPass = readTrimmed(def.passwordEnv);
  if (channelUser && channelPass) {
    return { user: channelUser, password: channelPass };
  }

  const sharedUser = readTrimmed("PARTNER_SMTP_USER");
  const sharedPass = readTrimmed("PARTNER_SMTP_PASSWORD");
  if (sharedUser && sharedPass) {
    return { user: sharedUser, password: sharedPass };
  }

  if (usingPartnerSmtp) {
    // Partner host configured but no credentials yet.
    return null;
  }

  // Retail SMTP credential fallback (same Hostinger account, From still partner mailbox).
  const retailMap: Record<PartnerEmailChannel, { user: string; pass: string }> =
    {
      noreply: {
        user: "SMTP_SUPPORT_USER",
        pass: "SMTP_SUPPORT_PASSWORD",
      },
      security: {
        user: "SMTP_SECURITY_USER",
        pass: "SMTP_SECURITY_PASSWORD",
      },
      billing: {
        user: "SMTP_BILLING_USER",
        pass: "SMTP_BILLING_PASSWORD",
      },
      support: {
        user: "SMTP_SUPPORT_USER",
        pass: "SMTP_SUPPORT_PASSWORD",
      },
      api: {
        user: "SMTP_SUPPORT_USER",
        pass: "SMTP_SUPPORT_PASSWORD",
      },
      partners: {
        user: "SMTP_SUPPORT_USER",
        pass: "SMTP_SUPPORT_PASSWORD",
      },
    };
  const mapped = retailMap[channel];
  const user = readTrimmed(mapped.user);
  const password = readTrimmed(mapped.pass);
  if (user && password) return { user, password };
  return null;
}

export function getPartnerEmailConfig(
  channel: PartnerEmailChannel
): PartnerEmailConfig {
  const definition = getPartnerChannelDefinition(channel);
  const base = partnerSharedSmtpBase();
  if (!base.ok) {
    return { configured: false, channel, reason: base.reason };
  }
  const auth = resolveAuth(channel, base.usingPartnerSmtp);
  if (!auth) {
    return {
      configured: false,
      channel,
      reason: "partner_smtp_credentials_missing",
    };
  }

  return {
    configured: true,
    channel,
    from: formatPartnerChannelFrom(channel),
    replyTo: formatPartnerReplyTo(),
    mailbox: definition.mailbox,
    usingPartnerSmtp: base.usingPartnerSmtp,
    smtp: {
      host: base.host,
      port: base.port,
      user: auth.user,
      password: auth.password,
      secure: base.tls.secure,
      requireTLS: base.tls.requireTLS,
    },
    definition,
  };
}

export function isPartnerEmailConfigured(
  channel: PartnerEmailChannel
): boolean {
  return getPartnerEmailConfig(channel).configured;
}
