/**
 * Server-only MAP eSIM transactional email channel registry.
 * Never import from client components.
 */

export const EMAIL_CHANNEL_IDS = [
  "security",
  "orders",
  "billing",
  "support",
] as const;

export type EmailChannel = (typeof EMAIL_CHANNEL_IDS)[number];

export type EmailChannelDefinition = {
  id: EmailChannel;
  /** Authenticated mailbox / envelope identity */
  mailbox: string;
  displayName: string;
  userEnv: string;
  passwordEnv: string;
  /** Default Reply-To to support@ for security/orders/billing */
  replyToSupport: boolean;
};

export const SUPPORT_MAILBOX = "support@mapesim.com";
export const SUPPORT_DISPLAY_NAME = "MAP eSIM Support";
export const SUPPORT_FROM = `${SUPPORT_DISPLAY_NAME} <${SUPPORT_MAILBOX}>`;
export const SUPPORT_REPLY_TO = SUPPORT_FROM;

export const EMAIL_CHANNELS: Record<EmailChannel, EmailChannelDefinition> = {
  security: {
    id: "security",
    mailbox: "security@mapesim.com",
    displayName: "MAP eSIM Security",
    userEnv: "SMTP_SECURITY_USER",
    passwordEnv: "SMTP_SECURITY_PASSWORD",
    replyToSupport: true,
  },
  orders: {
    id: "orders",
    mailbox: "orders@mapesim.com",
    displayName: "MAP eSIM Orders",
    userEnv: "SMTP_ORDERS_USER",
    passwordEnv: "SMTP_ORDERS_PASSWORD",
    replyToSupport: true,
  },
  billing: {
    id: "billing",
    mailbox: "billing@mapesim.com",
    displayName: "MAP eSIM Billing",
    userEnv: "SMTP_BILLING_USER",
    passwordEnv: "SMTP_BILLING_PASSWORD",
    replyToSupport: true,
  },
  support: {
    id: "support",
    mailbox: SUPPORT_MAILBOX,
    displayName: SUPPORT_DISPLAY_NAME,
    userEnv: "SMTP_SUPPORT_USER",
    passwordEnv: "SMTP_SUPPORT_PASSWORD",
    replyToSupport: true,
  },
};

export function isEmailChannel(value: string): value is EmailChannel {
  return (EMAIL_CHANNEL_IDS as readonly string[]).includes(value);
}

export function getChannelDefinition(channel: EmailChannel): EmailChannelDefinition {
  return EMAIL_CHANNELS[channel];
}

export function formatChannelFrom(channel: EmailChannel): string {
  const def = EMAIL_CHANNELS[channel];
  return `${def.displayName} <${def.mailbox}>`;
}

/**
 * Reply-To is always MAP eSIM Support for every channel.
 * EMAIL_REPLY_TO may only confirm support@mapesim.com — never arbitrary addresses.
 */
export function formatChannelReplyTo(): string {
  const configured = (process.env.EMAIL_REPLY_TO || SUPPORT_MAILBOX)
    .trim()
    .toLowerCase();
  if (configured && configured !== SUPPORT_MAILBOX) {
    return SUPPORT_REPLY_TO;
  }
  return SUPPORT_REPLY_TO;
}
