/**
 * Partner B2B transactional email templates (wallet, low balance, API key, order ready).
 */
import { BRAND_NAME } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
import {
  renderEmailCtaButton,
  renderEmailDetailRow,
  renderEmailHeading,
  renderEmailLead,
  renderEmailSummaryPanel,
} from "@/app/lib/email/emailUi";
import { resolvePartnerSiteOrigin } from "@/app/lib/email/partnerChannels";

function partnerFooterNote(): string {
  return `Partner portal: ${resolvePartnerSiteOrigin()}`;
}

export type PartnerWalletEmailPayload = {
  partnerName: string;
  typeLabel: string;
  amountLabel: string;
  balanceLabel: string;
  referenceLabel: string;
  occurredAtLabel: string;
  walletUrl: string;
};

export function partnerWalletEmailSubject(typeLabel: string): string {
  return `${BRAND_NAME} Partner wallet · ${typeLabel}`;
}

export function renderPartnerWalletEmailHtml(
  payload: PartnerWalletEmailPayload
): string {
  const name = escapeHtml(payload.partnerName || "Partner");
  const rows = [
    renderEmailDetailRow("Type", payload.typeLabel),
    renderEmailDetailRow("Amount", payload.amountLabel),
    renderEmailDetailRow("Updated balance", payload.balanceLabel),
    renderEmailDetailRow("Reference", payload.referenceLabel),
    renderEmailDetailRow("Date", payload.occurredAtLabel),
  ].join("");

  return renderTransactionalEmailLayoutHtml({
    title: partnerWalletEmailSubject(payload.typeLabel),
    preheader: `${payload.typeLabel} · ${payload.amountLabel}`,
    contentHtml: `
              ${renderEmailHeading(payload.typeLabel)}
              ${renderEmailLead(
                `Hello ${name}, your ${escapeHtml(BRAND_NAME)} Partner wallet was updated.`
              )}
              ${renderEmailSummaryPanel("Wallet update", rows)}
              ${renderEmailCtaButton(payload.walletUrl, "Open Partner wallet")}`,
  });
}

export function renderPartnerWalletEmailText(
  payload: PartnerWalletEmailPayload
): string {
  return [
    BRAND_NAME,
    "",
    payload.typeLabel,
    "",
    `Hello ${payload.partnerName || "Partner"},`,
    "Your Partner wallet was updated.",
    "",
    `Type: ${payload.typeLabel}`,
    `Amount: ${payload.amountLabel}`,
    `Updated balance: ${payload.balanceLabel}`,
    `Reference: ${payload.referenceLabel}`,
    `Date: ${payload.occurredAtLabel}`,
    "",
    `Open wallet: ${payload.walletUrl}`,
    "",
    partnerFooterNote(),
    renderEmailFooterText(),
  ].join("\n");
}

export type PartnerLowBalanceEmailPayload = {
  partnerName: string;
  balanceLabel: string;
  thresholdLabel: string;
  walletUrl: string;
};

export function partnerLowBalanceEmailSubject(): string {
  return `${BRAND_NAME} Partner · Low wallet balance`;
}

export function renderPartnerLowBalanceEmailHtml(
  payload: PartnerLowBalanceEmailPayload
): string {
  const name = escapeHtml(payload.partnerName || "Partner");
  return renderTransactionalEmailLayoutHtml({
    title: partnerLowBalanceEmailSubject(),
    preheader: `Balance ${payload.balanceLabel} is below ${payload.thresholdLabel}`,
    contentHtml: `
              ${renderEmailHeading("Low Partner wallet balance")}
              ${renderEmailLead(
                `Hello ${name}, your Partner MAP Wallet balance dropped below ${escapeHtml(payload.thresholdLabel)}.`
              )}
              <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Current balance: <strong style="color:${TEXT_PRIMARY};">${escapeHtml(payload.balanceLabel)}</strong>
              </p>
              ${renderEmailCtaButton(payload.walletUrl, "Top up wallet")}`,
  });
}

export function renderPartnerLowBalanceEmailText(
  payload: PartnerLowBalanceEmailPayload
): string {
  return [
    BRAND_NAME,
    "",
    "Low Partner wallet balance",
    "",
    `Hello ${payload.partnerName || "Partner"},`,
    `Your balance (${payload.balanceLabel}) is below ${payload.thresholdLabel}.`,
    "",
    `Top up: ${payload.walletUrl}`,
    "",
    partnerFooterNote(),
    renderEmailFooterText(),
  ].join("\n");
}

export type PartnerApiKeyEmailPayload = {
  partnerName: string;
  event: "created" | "revoked";
  keyName: string;
  keyPrefix: string;
  occurredAtLabel: string;
  accountUrl: string;
};

export function partnerApiKeyEmailSubject(
  event: "created" | "revoked"
): string {
  return event === "created"
    ? `${BRAND_NAME} Partner · API key created`
    : `${BRAND_NAME} Partner · API key revoked`;
}

export function renderPartnerApiKeyEmailHtml(
  payload: PartnerApiKeyEmailPayload
): string {
  const name = escapeHtml(payload.partnerName || "Partner");
  const headline =
    payload.event === "created" ? "API key created" : "API key revoked";
  const rows = [
    renderEmailDetailRow("Key name", payload.keyName),
    renderEmailDetailRow("Key prefix", payload.keyPrefix),
    renderEmailDetailRow("When", payload.occurredAtLabel),
  ].join("");
  return renderTransactionalEmailLayoutHtml({
    title: partnerApiKeyEmailSubject(payload.event),
    contentHtml: `
              ${renderEmailHeading(headline)}
              ${renderEmailLead(
                `Hello ${name}, a live Partner API key (${escapeHtml("map_live_…")}) was ${payload.event === "created" ? "generated" : "revoked"}.`
              )}
              ${renderEmailSummaryPanel("Key details", rows)}
              ${renderEmailCtaButton(payload.accountUrl, "Open Partner account")}`,
  });
}

export function renderPartnerApiKeyEmailText(
  payload: PartnerApiKeyEmailPayload
): string {
  return [
    BRAND_NAME,
    "",
    partnerApiKeyEmailSubject(payload.event),
    "",
    `Hello ${payload.partnerName || "Partner"},`,
    `API key ${payload.event}: ${payload.keyName} (${payload.keyPrefix})`,
    `When: ${payload.occurredAtLabel}`,
    "",
    `Account: ${payload.accountUrl}`,
    "",
    partnerFooterNote(),
    renderEmailFooterText(),
  ].join("\n");
}

export type PartnerOrderReadyEmailPayload = {
  partnerName: string;
  planLabel: string;
  destinationLabel: string;
  orderReference: string;
  amountLabel: string;
  ordersUrl: string;
};

export function partnerOrderReadyEmailSubject(): string {
  return `${BRAND_NAME} Partner · eSIM ready`;
}

export function renderPartnerOrderReadyEmailHtml(
  payload: PartnerOrderReadyEmailPayload
): string {
  const name = escapeHtml(payload.partnerName || "Partner");
  const rows = [
    renderEmailDetailRow("Plan", payload.planLabel),
    renderEmailDetailRow("Destination", payload.destinationLabel),
    renderEmailDetailRow("Reference", payload.orderReference),
    renderEmailDetailRow("Amount debited", payload.amountLabel),
  ].join("");
  return renderTransactionalEmailLayoutHtml({
    title: partnerOrderReadyEmailSubject(),
    contentHtml: `
              ${renderEmailHeading("Your Partner eSIM is ready")}
              ${renderEmailLead(
                `Hello ${name}, your Partner eSIM purchase completed successfully.`
              )}
              ${renderEmailSummaryPanel("Order summary", rows)}
              ${renderEmailCtaButton(payload.ordersUrl, "View Partner orders")}`,
  });
}

export function renderPartnerOrderReadyEmailText(
  payload: PartnerOrderReadyEmailPayload
): string {
  return [
    BRAND_NAME,
    "",
    "Your Partner eSIM is ready",
    "",
    `Hello ${payload.partnerName || "Partner"},`,
    `Plan: ${payload.planLabel}`,
    `Destination: ${payload.destinationLabel}`,
    `Reference: ${payload.orderReference}`,
    `Amount debited: ${payload.amountLabel}`,
    "",
    `Orders: ${payload.ordersUrl}`,
    "",
    partnerFooterNote(),
    renderEmailFooterText(),
  ].join("\n");
}
