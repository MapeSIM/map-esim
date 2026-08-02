import {
  extractOfficialActivationLinks,
  isOfficialAppleEsimActivationUrl,
  isOfficialAndroidActivationUrl,
  isValidProviderActivationUrl,
} from "@/app/lib/email/activation";
import {
  extractInstallDetails,
  hasInstallDetails,
} from "@/app/lib/email/extract";
import { isValidInstallQrValue } from "@/app/lib/email/qr";
import { buildAuthorizedOrderPath } from "@/app/lib/vesim/orderAccess";

export type SafeInstallActions = {
  hasInstallDetails: boolean;
  hasVerifiedLpa: boolean;
  hasOfficialIphoneActivationUrl: boolean;
  hasOfficialAndroidActivationUrl: boolean;
  /**
   * Present only when VeSIM supplied a validated official Apple activation URL.
   * Relative path — never embeds LPA/activation secrets.
   */
  iphoneInstallHref?: string;
  iphoneGuideHref: string;
  qrDownloadHref?: string;
  qrViewHref?: string;
  androidGuideHref: string;
  /** Only when VeSIM supplies a validated official Android activation URL. */
  androidActivationUrl?: string;
};

/**
 * Builds client-safe install action hrefs from a verified broker order payload.
 * One-click iPhone/Android buttons require official provider URLs — never LPA invention.
 * All order-scoped hrefs include the server-issued access token.
 */
export function buildSafeInstallActions(
  orderId: string,
  orderPayload: Record<string, unknown>,
  accessToken: string
): SafeInstallActions {
  const id = orderId.trim();
  const access = accessToken.trim();
  const install = extractInstallDetails(orderPayload);
  const official = extractOfficialActivationLinks(orderPayload);
  const hasVerifiedLpa = Boolean(
    install.qrValue && isValidInstallQrValue(install.qrValue)
  );

  const hasOfficialIphoneActivationUrl = Boolean(
    official.iphoneActivationUrl &&
      isOfficialAppleEsimActivationUrl(official.iphoneActivationUrl)
  );
  const hasOfficialAndroidActivationUrl = Boolean(
    official.androidActivationUrl &&
      isOfficialAndroidActivationUrl(official.androidActivationUrl)
  );

  return {
    hasInstallDetails: hasInstallDetails(install),
    hasVerifiedLpa,
    hasOfficialIphoneActivationUrl,
    hasOfficialAndroidActivationUrl,
    iphoneInstallHref: hasOfficialIphoneActivationUrl
      ? buildAuthorizedOrderPath("/api/vesim/install/iphone", id, access)
      : undefined,
    iphoneGuideHref: "/install/iphone",
    qrDownloadHref: hasVerifiedLpa
      ? buildAuthorizedOrderPath("/api/vesim/install/qr", id, access, {
          disposition: "attachment",
        })
      : undefined,
    qrViewHref: hasVerifiedLpa
      ? buildAuthorizedOrderPath("/api/vesim/install/qr", id, access, {
          disposition: "inline",
        })
      : undefined,
    androidGuideHref: "/install/android",
    androidActivationUrl: hasOfficialAndroidActivationUrl
      ? official.androidActivationUrl
      : undefined,
  };
}

/**
 * Resolves the server-side iPhone activation target for an order.
 * Uses only a validated official provider Apple URL — never builds from LPA.
 */
export function resolveIphoneActivationRedirectUrl(
  orderPayload: Record<string, unknown>
): string | null {
  const official = extractOfficialActivationLinks(orderPayload);
  if (
    official.iphoneActivationUrl &&
    isOfficialAppleEsimActivationUrl(official.iphoneActivationUrl)
  ) {
    return official.iphoneActivationUrl;
  }
  return null;
}

export function assertSafeExternalActivationUrl(url: string): boolean {
  return isValidProviderActivationUrl(url);
}
