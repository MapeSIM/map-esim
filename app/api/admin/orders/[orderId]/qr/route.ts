import { NextRequest, NextResponse } from "next/server";
import { buildDownloadableQrFilename } from "@/app/lib/email/format";
import { extractInstallDetails } from "@/app/lib/email/extract";
import {
  generateEsimQrPngBuffer,
  isValidInstallQrValue,
} from "@/app/lib/email/qr";
import {
  adminInstallNotFoundResponse,
  authorizeAdminOrderInstall,
  fetchAdminBrokerOrderPayload,
} from "@/app/lib/orders/adminOrderInstall";
import { publicErrorMessage } from "@/app/lib/vesim/server";

/**
 * Admin session-authenticated QR PNG for a local order.
 * Never accepts LPA/secrets from the query string.
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
        return adminInstallNotFoundResponse();
      }
    }

    const { orderId } = await context.params;
    const authz = await authorizeAdminOrderInstall(orderId);
    if (!authz.ok) return authz.response;

    const download =
      req.nextUrl.searchParams.get("download") === "1" ||
      req.nextUrl.searchParams.get("download") === "true";
    const disposition = download ? "attachment" : "inline";

    const orderData = await fetchAdminBrokerOrderPayload(
      authz.order.providerOrderId
    );
    if (!orderData) {
      return adminInstallNotFoundResponse();
    }

    const install = extractInstallDetails(orderData);
    const lpa = install.qrValue?.trim();
    if (!lpa || !isValidInstallQrValue(lpa)) {
      return adminInstallNotFoundResponse();
    }

    const png = await generateEsimQrPngBuffer(lpa);
    if (!png) {
      return adminInstallNotFoundResponse();
    }

    const filename = buildDownloadableQrFilename(
      authz.order.destination || "Destination",
      authz.order.localOrderId
    );

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error(
      "Admin QR route error:",
      error instanceof Error ? error.message : "unknown_error"
    );
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to load QR code"),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  }
}
