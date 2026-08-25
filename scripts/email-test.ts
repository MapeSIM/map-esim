/**
 * Safe per-channel SMTP smoke test.
 * Does NOT send OTPs, passwords, QR/LPA, or real order data.
 *
 * Loads Next.js env files (.env, .env.local, ...) via @next/env before reading vars.
 *
 * Usage:
 *   npm run email:test -- security --dry-run
 *   npm run email:test -- security
 *   npm run email:test -- orders
 *
 * Refuses to run without EMAIL_TEST_RECIPIENT.
 * Never logs SMTP passwords or recipient addresses.
 */
import { loadEnvConfig } from "@next/env";
import {
  EMAIL_CHANNEL_IDS,
  formatChannelFrom,
  formatChannelReplyTo,
  isEmailChannel,
  type EmailChannel,
} from "../app/lib/email/channels";
import {
  getEmailChannelsReadiness,
  getEmailConfig,
} from "../app/lib/email/config";
import { sendChannelMail } from "../app/lib/email/transport";
import {
  renderEmailFooterHtml,
  renderEmailFooterText,
} from "../app/lib/email/brand";

// Official Next.js loader — must run before reading process.env for this script.
loadEnvConfig(process.cwd());

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  channel: EmailChannel | "all";
  dryRun: boolean;
} {
  const tokens = argv.map((a) => a.trim()).filter(Boolean);
  const dryRun = tokens.includes("--dry-run") || tokens.includes("--check");
  const channelToken = tokens.find((t) => !t.startsWith("--")) || "";

  if (!channelToken) {
    fail(
      `Missing channel. Use one of: ${EMAIL_CHANNEL_IDS.join(", ")}, all\n` +
        "Example: npm run email:test -- security --dry-run"
    );
  }
  const normalized = channelToken.toLowerCase();
  if (normalized === "all") {
    return { channel: "all", dryRun };
  }
  if (!isEmailChannel(normalized)) {
    fail(
      `Invalid channel "${channelToken}". Use one of: ${EMAIL_CHANNEL_IDS.join(", ")}, all`
    );
  }
  return { channel: normalized as EmailChannel, dryRun };
}

function validateRecipient(raw: string): string {
  const value = raw.trim();
  if (!value) {
    fail(
      "EMAIL_TEST_RECIPIENT is required. Set a single controlled test inbox in .env.local, then re-run."
    );
  }
  if (value.includes(",") || value.includes(";") || value.includes(" ")) {
    fail("EMAIL_TEST_RECIPIENT must be a single email address (no lists).");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    fail("EMAIL_TEST_RECIPIENT is not a valid email address.");
  }
  const domain = value.split("@")[1]?.toLowerCase() || "";
  if (domain === "example.com" || domain.endsWith(".example")) {
    fail(
      "Refusing @example.com for live SMTP delivery (cannot receive mail). Use a real controlled inbox."
    );
  }
  return value.toLowerCase();
}

function envPresent(name: string): boolean {
  return Boolean((process.env[name] || "").trim());
}

async function sendOrCheckChannel(
  channel: EmailChannel,
  recipient: string,
  dryRun: boolean
): Promise<void> {
  const config = getEmailConfig(channel);
  if (!config.configured) {
    fail(
      `Channel "${channel}" is not configured (${config.reason}). ` +
        "Set SMTP_HOST/SMTP_PORT/SMTP_SECURE and the channel USER/PASSWORD in .env.local."
    );
  }

  // Non-delivery validation — names only, never values.
  console.log(`Channel: ${channel}`);
  console.log(`Dry-run: ${dryRun ? "yes" : "no"}`);
  console.log(`EMAIL_TEST_RECIPIENT: detected`);
  console.log(`SMTP_HOST: ${envPresent("SMTP_HOST") ? "detected" : "missing"}`);
  console.log(`SMTP_PORT: ${envPresent("SMTP_PORT") ? "detected" : "missing"}`);
  console.log(
    `SMTP_SECURE: ${envPresent("SMTP_SECURE") ? "detected" : "missing"}`
  );
  console.log(`Channel credentials: configured`);
  console.log(`From header: ${formatChannelFrom(channel)}`);
  console.log(`Reply-To header: ${formatChannelReplyTo()}`);

  if (dryRun) {
    void recipient.length;
    console.log("Status: env_ok (no email sent)");
    return;
  }

  const stamp = new Date().toISOString();
  const subject = `[MAP eSIM SMTP TEST] ${channel.toUpperCase()} ${stamp}`;
  const text = [
    "MAP eSIM channel SMTP test",
    "",
    `Channel: ${channel}`,
    `From: ${formatChannelFrom(channel)}`,
    `Reply-To: ${formatChannelReplyTo()}`,
    `Sent at: ${stamp}`,
    "",
    "This message contains no OTPs, passwords, QR codes, LPA strings, or order data.",
    "",
    renderEmailFooterText(channel),
  ].join("\n");

  const html = `<!DOCTYPE html><html><body>
  <p><strong>MAP eSIM channel SMTP test</strong></p>
  <p>Channel: <code>${channel}</code></p>
  <p>From: ${formatChannelFrom(channel)}</p>
  <p>Reply-To: ${formatChannelReplyTo()}</p>
  <p>Sent at: ${stamp}</p>
  <p>This message contains no OTPs, passwords, QR codes, LPA strings, or order data.</p>
  ${renderEmailFooterHtml(channel)}
  </body></html>`;

  const result = await sendChannelMail({
    channel,
    to: recipient,
    subject,
    text,
    html,
    headers: {
      "X-MAP-ESIM-Email-Test": channel,
    },
  });

  if (!result.ok) {
    fail(`Send failed: ${result.reason}`);
  }

  console.log("Status: sent");
}

async function main() {
  const { channel, dryRun } = parseArgs(process.argv.slice(2));
  const recipient = validateRecipient(process.env.EMAIL_TEST_RECIPIENT || "");

  if (channel === "all") {
    const readiness = getEmailChannelsReadiness();
    console.log(
      `SMTP channels configured: ${readiness.configuredCount}/${readiness.totalCount}`
    );
    for (const row of readiness.channels) {
      console.log(
        `  ${row.channel}: ${row.configured ? "configured" : row.reason || "not_configured"}`
      );
    }
    if (!readiness.allConfigured) {
      fail(
        `Not all channels are configured (${readiness.missingChannels.join(", ")}). ` +
          "Set SMTP_HOST/SMTP_PORT/SMTP_SECURE and each channel USER/PASSWORD in .env.local."
      );
    }
    for (const id of EMAIL_CHANNEL_IDS) {
      await sendOrCheckChannel(id, recipient, dryRun);
    }
    return;
  }

  await sendOrCheckChannel(channel, recipient, dryRun);
}

main().catch(() => {
  console.error("Send failed: unexpected_error");
  process.exit(1);
});
