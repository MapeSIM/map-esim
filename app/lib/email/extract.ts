import {
  extractOfficialActivationLinks,
  getAndroidInstallGuideUrl,
  getIphoneInstallGuideUrl,
} from "@/app/lib/email/activation";
import type { OrderEmailPayload } from "@/app/lib/email/types";
import type { VerifiedCheckoutOffer } from "@/app/lib/vesim/server";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function dig(record: JsonRecord | null, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (key in record && record[key] != null && record[key] !== "") {
      return record[key];
    }
  }
  return undefined;
}

function collectContainers(root: JsonRecord): JsonRecord[] {
  const containers: JsonRecord[] = [root];
  const nestedKeys = [
    "order",
    "data",
    "esim",
    "eSim",
    "profile",
    "profiles",
    "installation",
    "install",
    "sim",
    "result",
  ];

  for (const key of nestedKeys) {
    const value = root[key];
    const asObj = asRecord(value);
    if (asObj) containers.push(asObj);

    if (Array.isArray(value)) {
      for (const item of value) {
        const itemObj = asRecord(item);
        if (itemObj) containers.push(itemObj);
      }
    }
  }

  return containers;
}

function extractFromContainers(
  containers: JsonRecord[],
  keys: string[]
): string | undefined {
  for (const container of containers) {
    const value = firstString(...keys.map((key) => dig(container, key)));
    if (value) return value;
  }
  return undefined;
}

function isLpaString(value?: string): boolean {
  return Boolean(value && /^LPA:1\$/i.test(value.trim()));
}

/** Provider QR image payloads (base64 / data-URI) must not be used as LPA text. */
function isLikelyImagePayload(value?: string): boolean {
  if (!value) return false;
  const v = value.trim();
  if (/^data:image\//i.test(v)) return true;
  if (/^iVBOR|^\/9j\//.test(v)) return true;
  if (v.length > 200 && !isLpaString(v)) return true;
  return false;
}

function parseLpa(lpa: string): { smdp?: string; matchingId?: string } {
  const parts = lpa.trim().split("$");
  if (parts.length < 3) return {};
  return {
    smdp: parts[1]?.trim() || undefined,
    matchingId: parts[2]?.trim() || undefined,
  };
}

export function extractInstallDetails(orderPayload: JsonRecord): {
  iccid?: string;
  qrValue?: string;
  smdpAddress?: string;
  activationCode?: string;
} {
  const containers = collectContainers(orderPayload);

  const iccid = extractFromContainers(containers, [
    "iccid",
    "ICCID",
    "iccId",
    "icc_id",
    "esim_iccid",
    "esimIccid",
  ]);

  let smdpAddress = extractFromContainers(containers, [
    "smdpAddress",
    "smDpAddress",
    "sm_dp_address",
    "smdp",
    "smDp+",
    "sm_dp",
    "esim_smdp_address",
    "esimSmdpAddress",
  ]);

  // VeSIM staging often returns the full LPA in esim_activation_code.
  const activationRaw = extractFromContainers(containers, [
    "esim_activation_code",
    "esimActivationCode",
    "activationCode",
    "activation_code",
    "matchingId",
    "matching_id",
    "confirmationCode",
    "confirmation_code",
  ]);

  const lpaCandidate = extractFromContainers(containers, [
    "lpa",
    "lpaString",
    "lpa_string",
    "esim_activation_code",
    "esimActivationCode",
  ]);

  const qrRaw = extractFromContainers(containers, [
    "qrCode",
    "qr_code",
    "qr",
    "qrValue",
    "esim_qr_code",
    "esimQrCode",
    "universalLink",
    "appleInstallUrl",
    "installationUrl",
    "installUrl",
  ]);

  let resolvedQr: string | undefined;
  if (isLpaString(lpaCandidate)) resolvedQr = lpaCandidate!.trim();
  else if (isLpaString(activationRaw)) resolvedQr = activationRaw!.trim();
  else if (isLpaString(qrRaw) && !isLikelyImagePayload(qrRaw)) {
    resolvedQr = qrRaw!.trim();
  }

  const parsed = resolvedQr ? parseLpa(resolvedQr) : {};
  if (!smdpAddress && parsed.smdp) smdpAddress = parsed.smdp;

  // Manual activation / matching ID (not the full LPA string, not image payloads).
  let activationCode: string | undefined;
  if (activationRaw && !isLpaString(activationRaw) && !isLikelyImagePayload(activationRaw)) {
    activationCode = activationRaw;
  } else if (parsed.matchingId) {
    activationCode = parsed.matchingId;
  }

  if (!resolvedQr && smdpAddress && activationCode) {
    resolvedQr = `LPA:1$${smdpAddress}$${activationCode}`;
  }

  return {
    iccid,
    qrValue: resolvedQr,
    smdpAddress,
    activationCode,
  };
}

export function hasInstallDetails(details: {
  iccid?: string;
  qrValue?: string;
  smdpAddress?: string;
  activationCode?: string;
}): boolean {
  return Boolean(
    details.iccid ||
      details.qrValue ||
      details.smdpAddress ||
      details.activationCode
  );
}

export const ASSISTED_WALLET_PURCHASE_EMAIL_NOTICE =
  "This eSIM was purchased for your account by MAP eSIM support using your available wallet balance.";

export function buildOrderEmailPayload(options: {
  customerEmail: string;
  orderId: string;
  verifiedOffer: VerifiedCheckoutOffer;
  orderPayload: JsonRecord;
  orderAccessUrl?: string;
  assistedWalletPurchaseNotice?: boolean;
}): OrderEmailPayload | null {
  const install = extractInstallDetails(options.orderPayload);
  if (!hasInstallDetails(install)) {
    return null;
  }

  const destination =
    options.verifiedOffer.countryName ||
    options.verifiedOffer.countryCode ||
    firstString(
      dig(options.orderPayload, "countryName", "country"),
      dig(asRecord(options.orderPayload.order), "countryName", "country")
    ) ||
    "—";

  const validity =
    options.verifiedOffer.durationDays != null
      ? `${options.verifiedOffer.durationDays} Days`
      : firstString(
          dig(options.orderPayload, "durationDays", "validity"),
          dig(asRecord(options.orderPayload.order), "durationDays", "validity")
        ) || "—";

  const officialLinks = extractOfficialActivationLinks(options.orderPayload);

  return {
    customerEmail: options.customerEmail.trim(),
    orderId: options.orderId.trim(),
    destination,
    planName: options.verifiedOffer.name,
    dataAllowance: options.verifiedOffer.dataFormatted || "—",
    validity,
    iccid: install.iccid,
    qrValue: install.qrValue,
    smdpAddress: install.smdpAddress,
    activationCode: install.activationCode,
    iphoneActivationUrl: officialLinks.iphoneActivationUrl,
    androidActivationUrl: officialLinks.androidActivationUrl,
    androidGuideUrl: getAndroidInstallGuideUrl(),
    iphoneGuideUrl: getIphoneInstallGuideUrl(),
    orderAccessUrl: options.orderAccessUrl?.trim() || undefined,
    supportPurchaseNotice: options.assistedWalletPurchaseNotice
      ? ASSISTED_WALLET_PURCHASE_EMAIL_NOTICE
      : undefined,
  };
}

export function buildManualInstallText(payload: {
  orderId?: string;
  iccid?: string;
  qrValue?: string;
  smdpAddress?: string;
  activationCode?: string;
}): string {
  const lines = [
    "MAP eSIM installation details",
    payload.orderId ? `Order ID: ${payload.orderId}` : "",
    payload.iccid ? `ICCID: ${payload.iccid}` : "",
    payload.smdpAddress ? `SM-DP+ Address: ${payload.smdpAddress}` : "",
    payload.activationCode ? `Activation Code: ${payload.activationCode}` : "",
    payload.qrValue ? `QR / LPA: ${payload.qrValue}` : "",
    "",
    "Manual install (iOS): Settings â†’ Mobile Service â†’ Add eSIM â†’ Use QR Code or Enter Details Manually.",
    "Manual install (Android): Settings â†’ Network & internet â†’ SIMs â†’ Add eSIM â†’ Scan QR or enter SM-DP+ details.",
    "",
    "Support: support@mapesim.com",
  ];

  return lines.filter((line, index, arr) => line !== "" || arr[index - 1] !== "").join("\n");
}
