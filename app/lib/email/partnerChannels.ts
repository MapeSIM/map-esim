/**
 * B2B partneresim.com email channel registry.
 * Isolated from retail mapesim.com channels.ts — never mutate retail channels.
 */

export const PARTNER_EMAIL_CHANNEL_IDS = [
  "noreply",
  "security",
  "billing",
  "support",
  "api",
  "partners",
] as const;

export type PartnerEmailChannel = (typeof PARTNER_EMAIL_CHANNEL_IDS)[number];

export type PartnerEmailChannelDefinition = {
  id: PartnerEmailChannel;
  mailbox: string;
  displayName: string;
  userEnv: string;
  passwordEnv: string;
};

export const PARTNER_SUPPORT_MAILBOX = "support@partneresim.com";
export const PARTNER_DEFAULT_SITE_ORIGIN = "https://partneresim.com";

export const PARTNER_EMAIL_CHANNELS: Record<
  PartnerEmailChannel,
  PartnerEmailChannelDefinition
> = {
  noreply: {
    id: "noreply",
    mailbox: "noreply@partneresim.com",
    displayName: "MAP eSIM Partner",
    userEnv: "PARTNER_SMTP_NOREPLY_USER",
    passwordEnv: "PARTNER_SMTP_NOREPLY_PASSWORD",
  },
  security: {
    id: "security",
    mailbox: "security@partneresim.com",
    displayName: "MAP eSIM Partner Security",
    userEnv: "PARTNER_SMTP_SECURITY_USER",
    passwordEnv: "PARTNER_SMTP_SECURITY_PASSWORD",
  },
  billing: {
    id: "billing",
    mailbox: "billing@partneresim.com",
    displayName: "MAP eSIM Partner Billing",
    userEnv: "PARTNER_SMTP_BILLING_USER",
    passwordEnv: "PARTNER_SMTP_BILLING_PASSWORD",
  },
  support: {
    id: "support",
    mailbox: PARTNER_SUPPORT_MAILBOX,
    displayName: "MAP eSIM Partner Support",
    userEnv: "PARTNER_SMTP_SUPPORT_USER",
    passwordEnv: "PARTNER_SMTP_SUPPORT_PASSWORD",
  },
  api: {
    id: "api",
    mailbox: "api@partneresim.com",
    displayName: "MAP eSIM Partner API",
    userEnv: "PARTNER_SMTP_API_USER",
    passwordEnv: "PARTNER_SMTP_API_PASSWORD",
  },
  partners: {
    id: "partners",
    mailbox: "partners@partneresim.com",
    displayName: "MAP eSIM Partners",
    userEnv: "PARTNER_SMTP_PARTNERS_USER",
    passwordEnv: "PARTNER_SMTP_PARTNERS_PASSWORD",
  },
};

export function isPartnerEmailChannel(
  value: string
): value is PartnerEmailChannel {
  return (PARTNER_EMAIL_CHANNEL_IDS as readonly string[]).includes(value);
}

export function getPartnerChannelDefinition(
  channel: PartnerEmailChannel
): PartnerEmailChannelDefinition {
  return PARTNER_EMAIL_CHANNELS[channel];
}

export function formatPartnerChannelFrom(channel: PartnerEmailChannel): string {
  const def = PARTNER_EMAIL_CHANNELS[channel];
  return `${def.displayName} <${def.mailbox}>`;
}

/** Public partner portal origin for CTAs / invite links. */
export function resolvePartnerSiteOrigin(): string {
  const fromEnv =
    (process.env.PARTNER_SITE_URL ?? "").trim() ||
    (process.env.PARTNER_SITE_ORIGIN ?? "").trim();
  if (fromEnv) {
    try {
      const u = new URL(fromEnv);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return u.origin;
      }
    } catch {
      /* fall through */
    }
  }
  return PARTNER_DEFAULT_SITE_ORIGIN;
}

export function formatPartnerReplyTo(): string {
  const configured = (process.env.PARTNER_EMAIL_REPLY_TO || "")
    .trim()
    .toLowerCase();
  if (configured && configured.includes("@")) {
    return `MAP eSIM Partner Support <${configured}>`;
  }
  return `MAP eSIM Partner Support <${PARTNER_SUPPORT_MAILBOX}>`;
}

/** Low-balance threshold in USD cents (default $10). */
export function partnerLowBalanceThresholdCents(): number {
  const raw = (process.env.PARTNER_LOW_BALANCE_THRESHOLD ?? "").trim();
  if (!raw) return 1_000;
  const asUsd = Number(raw);
  if (Number.isFinite(asUsd) && asUsd >= 0) {
    // Allow cents ("1000") or dollars ("10" / "10.00")
    if (asUsd >= 100 && Number.isInteger(asUsd)) return Math.floor(asUsd);
    return Math.round(asUsd * 100);
  }
  return 1_000;
}
