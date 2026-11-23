/**
 * Non-blocking B2B partner email dispatchers.
 * SMTP failures must never roll back wallet / order / API key work.
 */
import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  partnerLowBalanceThresholdCents,
  resolvePartnerSiteOrigin,
} from "@/app/lib/email/partnerChannels";
import { isPartnerEmailConfigured } from "@/app/lib/email/partnerEmailConfig";
import { sendPartnerChannelMail } from "@/app/lib/email/partnerTransport";
import {
  partnerApiKeyEmailSubject,
  partnerLowBalanceEmailSubject,
  partnerOrderReadyEmailSubject,
  partnerWalletEmailSubject,
  renderPartnerApiKeyEmailHtml,
  renderPartnerApiKeyEmailText,
  renderPartnerLowBalanceEmailHtml,
  renderPartnerLowBalanceEmailText,
  renderPartnerOrderReadyEmailHtml,
  renderPartnerOrderReadyEmailText,
  renderPartnerWalletEmailHtml,
  renderPartnerWalletEmailText,
} from "@/app/lib/email/partnerTransactionalTemplates";
import { shortPartnerPurchaseReference } from "@/app/lib/partner/partnerOrdersDisplay";
import { formatUsdCents } from "@/app/lib/wallet/display";

function formatWhen(date = new Date()): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

async function loadPartnerRecipient(partnerId: string): Promise<{
  email: string;
  name: string;
} | null> {
  const row = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      disabledAt: true,
      user: {
        select: { email: true, name: true, role: true, deletedAt: true },
      },
    },
  });
  if (!row || row.disabledAt) return null;
  const user = row.user;
  if (!user || user.deletedAt || user.role !== Role.PARTNER) return null;
  const email = (user.email ?? "").trim();
  if (!email || !email.includes("@")) return null;
  return { email, name: (user.name ?? "").trim() || "Partner" };
}

export async function notifyPartnerWalletEmail(input: {
  partnerId: string;
  type: "credit" | "debit" | "top_up";
  amountCents: number;
  balanceCents: number;
  reference: string;
}): Promise<void> {
  try {
    if (!isPartnerEmailConfigured("billing")) return;
    const recipient = await loadPartnerRecipient(input.partnerId);
    if (!recipient) return;
    const typeLabel =
      input.type === "credit"
        ? "Wallet credit"
        : input.type === "debit"
          ? "Wallet debit"
          : "Wallet top-up";
    const amountLabel = formatUsdCents(Math.abs(input.amountCents));
    const balanceLabel = formatUsdCents(input.balanceCents);
    const walletUrl = `${resolvePartnerSiteOrigin()}/partner/wallet`;
    const payload = {
      partnerName: recipient.name,
      typeLabel,
      amountLabel,
      balanceLabel,
      referenceLabel: input.reference.slice(0, 120),
      occurredAtLabel: formatWhen(),
      walletUrl,
    };
    await sendPartnerChannelMail({
      channel: "billing",
      to: recipient.email,
      subject: partnerWalletEmailSubject(typeLabel),
      text: renderPartnerWalletEmailText(payload),
      html: renderPartnerWalletEmailHtml(payload),
      headers: {
        "X-MAP-ESIM-Partner-Mail": "wallet_update",
        "X-MAP-ESIM-Partner-Wallet-Type": input.type,
      },
    });
  } catch {
    console.error("partner_wallet_email", "dispatch_error");
  }
}

export function schedulePartnerWalletEmail(
  input: Parameters<typeof notifyPartnerWalletEmail>[0]
): void {
  void notifyPartnerWalletEmail(input).catch(() => undefined);
}

/**
 * Fire only when balance crosses from >= threshold to < threshold.
 */
export async function notifyPartnerLowBalanceIfCrossed(input: {
  partnerId: string;
  previousBalanceCents: number;
  newBalanceCents: number;
}): Promise<void> {
  try {
    const threshold = partnerLowBalanceThresholdCents();
    if (
      input.previousBalanceCents < threshold ||
      input.newBalanceCents >= threshold
    ) {
      return;
    }
    if (!isPartnerEmailConfigured("noreply")) return;
    const recipient = await loadPartnerRecipient(input.partnerId);
    if (!recipient) return;
    const payload = {
      partnerName: recipient.name,
      balanceLabel: formatUsdCents(input.newBalanceCents),
      thresholdLabel: formatUsdCents(threshold),
      walletUrl: `${resolvePartnerSiteOrigin()}/partner/wallet`,
    };
    await sendPartnerChannelMail({
      channel: "noreply",
      to: recipient.email,
      subject: partnerLowBalanceEmailSubject(),
      text: renderPartnerLowBalanceEmailText(payload),
      html: renderPartnerLowBalanceEmailHtml(payload),
      headers: {
        "X-MAP-ESIM-Partner-Mail": "low_balance",
      },
    });
  } catch {
    console.error("partner_low_balance_email", "dispatch_error");
  }
}

export function schedulePartnerLowBalanceIfCrossed(
  input: Parameters<typeof notifyPartnerLowBalanceIfCrossed>[0]
): void {
  void notifyPartnerLowBalanceIfCrossed(input).catch(() => undefined);
}

export async function notifyPartnerApiKeyEmail(input: {
  partnerId: string;
  event: "created" | "revoked";
  keyName: string;
  keyPrefix: string;
}): Promise<void> {
  try {
    if (!isPartnerEmailConfigured("api")) return;
    const recipient = await loadPartnerRecipient(input.partnerId);
    if (!recipient) return;
    const payload = {
      partnerName: recipient.name,
      event: input.event,
      keyName: input.keyName.slice(0, 64),
      keyPrefix: input.keyPrefix.slice(0, 32),
      occurredAtLabel: formatWhen(),
      accountUrl: `${resolvePartnerSiteOrigin()}/partner/account`,
    };
    await sendPartnerChannelMail({
      channel: "api",
      to: recipient.email,
      subject: partnerApiKeyEmailSubject(input.event),
      text: renderPartnerApiKeyEmailText(payload),
      html: renderPartnerApiKeyEmailHtml(payload),
      headers: {
        "X-MAP-ESIM-Partner-Mail": "api_key",
        "X-MAP-ESIM-Partner-Api-Event": input.event,
      },
    });
  } catch {
    console.error("partner_api_key_email", "dispatch_error");
  }
}

export function schedulePartnerApiKeyEmail(
  input: Parameters<typeof notifyPartnerApiKeyEmail>[0]
): void {
  void notifyPartnerApiKeyEmail(input).catch(() => undefined);
}

export async function notifyPartnerOrderReadyEmail(
  purchaseId: string
): Promise<void> {
  try {
    const id = (purchaseId ?? "").trim();
    if (!id) return;
    if (!isPartnerEmailConfigured("noreply")) return;

    const row = await prisma.partnerEsimPurchase.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        planName: true,
        destinationName: true,
        destinationCode: true,
        partnerChargeCents: true,
        partnerId: true,
        partner: {
          select: {
            disabledAt: true,
            user: {
              select: { email: true, name: true, role: true, deletedAt: true },
            },
          },
        },
      },
    });
    if (!row || row.status !== "COMPLETED") return;
    const user = row.partner?.user;
    if (
      !user ||
      row.partner.disabledAt ||
      user.deletedAt ||
      user.role !== Role.PARTNER
    ) {
      return;
    }
    const to = (user.email ?? "").trim();
    if (!to) return;

    const payload = {
      partnerName: (user.name ?? "").trim() || "Partner",
      planLabel: (row.planName ?? "").trim() || "eSIM plan",
      destinationLabel:
        (row.destinationName ?? "").trim() ||
        (row.destinationCode ?? "").trim() ||
        "—",
      orderReference: shortPartnerPurchaseReference(row.id),
      amountLabel: formatUsdCents(Math.max(0, row.partnerChargeCents)),
      ordersUrl: `${resolvePartnerSiteOrigin()}/partner/orders`,
    };

    await sendPartnerChannelMail({
      channel: "noreply",
      to,
      subject: sanitizeEmailHeaderValue(partnerOrderReadyEmailSubject(), 160),
      text: renderPartnerOrderReadyEmailText(payload),
      html: renderPartnerOrderReadyEmailHtml(payload),
      headers: {
        "X-MAP-ESIM-Partner-Mail": "order_ready",
        "X-MAP-ESIM-Partner-Purchase": sanitizeEmailHeaderValue(id, 64),
      },
    });
  } catch {
    console.error("partner_order_ready_email", "dispatch_error");
  }
}

export function schedulePartnerOrderReadyEmail(purchaseId: string): void {
  void notifyPartnerOrderReadyEmail(purchaseId).catch(() => undefined);
}
