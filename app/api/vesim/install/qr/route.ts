import { NextRequest, NextResponse } from "next/server";
import { buildDownloadableQrFilename } from "@/app/lib/email/format";
import { extractInstallDetails } from "@/app/lib/email/extract";
import {
  generateEsimQrPngBuffer,
  isValidInstallQrValue,
} from "@/app/lib/email/qr";
import { authorizeOrderAccess } from "@/app/lib/vesim/orderAccess";
import {
  getBrokerToken,
  getVesimBaseUrl,
  publicErrorMessage,
  readJsonSafe,
} from "@/app/lib/vesim/server";

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Serves a PNG QR generated server-side from verified order LPA data only.
 * Requires a valid order access token. Never a permanent public QR URL.
 */
export async function GET(req: NextRequest) {
  try {
    const dispositionRaw =
      req.nextUrl.searchParams.get("disposition")?.trim().toLowerCase() ||
      "inline";
    const disposition =
      dispositionRaw === "attachment" ? "attachment" : "inline";

    for (const banned of [
      "lpa",
      "qrValue",
      "activationCode",
      "carddata",
      "smdp",
    ]) {
      if (req.nextUrl.searchParams.has(banned)) {
        return NextResponse.json(
          { success: false, error: "Not found" },
          { status: 404 }
        );
      }
    }

    const auth = authorizeOrderAccess(req);
    if (!auth.ok) return auth.response;
    const { orderId } = auth;

    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();
    const orderResponse = await fetch(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        cache: "no-store",
      }
    );

    const orderData = await readJsonSafe(orderResponse);
    if (!orderResponse.ok) {
      console.error("QR install order fetch failed:", orderResponse.status);
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    const install = extractInstallDetails(orderData);
    const lpa = install.qrValue?.trim();
    if (!lpa || !isValidInstallQrValue(lpa)) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    const png = await generateEsimQrPngBuffer(lpa);
    if (!png) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    const payload =
      asRecord(orderData.order) ||
      asRecord(orderData.data) ||
      orderData;
    const destination =
      firstString(payload.countryName, payload.country, "Destination") ||
      "Destination";
    const filename = buildDownloadableQrFilename(destination, orderId);

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error(
      "QR install route error:",
      error instanceof Error ? error.message : "unknown_error"
    );
    return NextResponse.json(
      {
        success: false,
        error: publicErrorMessage(error, "Unable to load QR code"),
      },
      { status: 500 }
    );
  }
}
