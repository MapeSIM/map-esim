import type { VerifiedCheckoutOffer } from "@/app/lib/vesim/server";
import type { OrderEmailPayload } from "@/app/lib/email/types";

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
  ]);

  const smdpAddress = extractFromContainers(containers, [
    "smdpAddress",
    "smDpAddress",
    "sm_dp_address",
    "smdp",
    "smDp+",
    "sm_dp",
  ]);

  // Prefer LPA / matching ID style values for QR installation.
  const qrValue = extractFromContainers(containers, [
    "qrCode",
    "qr_code",
    "qr",
    "qrValue",
    "lpa",
    "lpaString",
    "lpa_string",
    "universalLink",
    "appleInstallUrl",
    "installationUrl",
    "installUrl",
  ]);

  const activationCode = extractFromContainers(containers, [
    "activationCode",
    "activation_code",
    "matchingId",
    "matching_id",
    "confirmationCode",
    "confirmation_code",
  ]);

  // If SM-DP+ and activation exist but no QR, build a standard LPA string.
  let resolvedQr = qrValue;
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

export function buildOrderEmailPayload(options: {
  customerEmail: string;
  orderId: string;
  verifiedOffer: VerifiedCheckoutOffer;
  orderPayload: JsonRecord;
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
    "MAP-eSIM installation details",
    payload.orderId ? `Order ID: ${payload.orderId}` : "",
    payload.iccid ? `ICCID: ${payload.iccid}` : "",
    payload.smdpAddress ? `SM-DP+ Address: ${payload.smdpAddress}` : "",
    payload.activationCode ? `Activation Code: ${payload.activationCode}` : "",
    payload.qrValue ? `QR / LPA: ${payload.qrValue}` : "",
    "",
    "Manual install (iOS): Settings → Mobile Service → Add eSIM → Use QR Code or Enter Details Manually.",
    "Manual install (Android): Settings → Network & internet → SIMs → Add eSIM → Scan QR or enter SM-DP+ details.",
    "",
    "Support: admin@mapesim.com",
  ];

  return lines.filter((line, index, arr) => line !== "" || arr[index - 1] !== "").join("\n");
}
