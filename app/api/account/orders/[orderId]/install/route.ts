import { NextRequest, NextResponse } from "next/server";
import {
  extractOfficialActivationLinks,
  isOfficialAndroidActivationUrl,
  isOfficialAppleEsimActivationUrl,
} from "@/app/lib/email/activation";
import { extractInstallDetails, hasInstallDetails } from "@/app/lib/email/extract";
import { isValidInstallQrValue } from "@/app/lib/email/qr";
import {
  authorizeCustomerOwnedOrderInstall,
  buildCustomerSessionInstallActions,
  customerInstallNotFoundResponse,
  fetchBrokerOrderPayload,
} from "@/app/lib/orders/customerOrderInstall";
import { publicErrorMessage } from "@/app/lib/vesim/server";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/**
 * Explicit customer action: load install capability + manual details.
 * Ownership verified server-side. Never returns full ICCID.
 * Never logs SM-DP+, activation code, LPA, or QR values.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    for (const banned of [
      "lpa",
      "qrValue",
      "activationCode",
      "carddata",
      "smdp",
      "access",
      "token",
      "iccid",
    ]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return customerInstallNotFoundResponse();
      }
    }

    const { orderId } = await context.params;
    const authz = await authorizeCustomerOwnedOrderInstall(orderId);
    if (!authz.ok) return authz.response;

    const orderData = await fetchBrokerOrderPayload(authz.order.providerOrderId);
    if (!orderData) {
      return NextResponse.json(
        {
          success: false,
          error: "Installation details are temporarily unavailable.",
        },
        { status: 503, headers: NO_STORE }
      );
    }

    const install = extractInstallDetails(orderData);
    const official = extractOfficialActivationLinks(orderData);
    const actions = buildCustomerSessionInstallActions(
      authz.order.localOrderId,
      orderData
    );
    const hasVerifiedLpa = Boolean(
      install.qrValue && isValidInstallQrValue(install.qrValue)
    );
    const hasOfficialIphone = Boolean(
      official.iphoneActivationUrl &&
        isOfficialAppleEsimActivationUrl(official.iphoneActivationUrl)
    );
    const hasOfficialAndroid = Boolean(
      official.androidActivationUrl &&
        isOfficialAndroidActivationUrl(official.androidActivationUrl)
    );

    if (!hasInstallDetails(install) && !hasOfficialIphone && !hasOfficialAndroid) {
      return NextResponse.json(
        {
          success: false,
          error: "Installation details are not available for this order yet.",
        },
        { status: 404, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      {
        success: true,
        hasInstallDetails: actions.hasInstallDetails,
        hasVerifiedLpa,
        hasOfficialIphoneActivationUrl: hasOfficialIphone,
        hasOfficialAndroidActivationUrl: hasOfficialAndroid,
        iphoneInstallHref: actions.iphoneInstallHref ?? null,
        iphoneGuideHref: actions.iphoneGuideHref,
        qrDownloadHref: actions.qrDownloadHref ?? null,
        qrViewHref: actions.qrViewHref ?? null,
        androidGuideHref: actions.androidGuideHref,
        androidActivationUrl: actions.androidActivationUrl ?? null,
        smdpAddress: install.smdpAddress?.trim() || null,
        activationCode: install.activationCode?.trim() || null,
        lpa: hasVerifiedLpa ? install.qrValue?.trim() || null : null,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error: unknown) {
    console.error(
      "Customer install-details route error:",
      error instanceof Error ? error.message : "unknown_error"
    );
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(
          error,
          "Unable to load installation details"
        ),
      },
      { status: 500, headers: NO_STORE }
    );
  }
}
