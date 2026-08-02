/**
 * Server-only email configuration. Never import from client components.
 */

export type EmailConfig =
  | { configured: false }
  | {
      configured: true;
      provider: string;
      from: string;
      smtp: {
        host: string;
        port: number;
        user: string;
        password: string;
        secure: boolean;
      };
    };

function readTrimmed(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getEmailConfig(): EmailConfig {
  const provider = readTrimmed("EMAIL_PROVIDER").toLowerCase() || "smtp";
  const from = readTrimmed("EMAIL_FROM");
  const host = readTrimmed("SMTP_HOST");
  const portRaw = readTrimmed("SMTP_PORT");
  const user = readTrimmed("SMTP_USER");
  const password = readTrimmed("SMTP_PASSWORD");

  const port = Number.parseInt(portRaw || "587", 10);

  if (!from || !host || !user || !password || !Number.isFinite(port) || port <= 0) {
    return { configured: false };
  }

  return {
    configured: true,
    provider,
    from,
    smtp: {
      host,
      port,
      user,
      password,
      secure: port === 465,
    },
  };
}

export function isEmailConfigured(): boolean {
  return getEmailConfig().configured;
}
