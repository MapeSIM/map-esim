import { NextRequest, NextResponse } from "next/server";
import {
  generateEsimQrDataUrl,
  resolveInstallQrValue,
} from "@/app/lib/email/qr";
import {
  getSampleOrderEmailPayload,
  renderOrderEmailHtml,
} from "@/app/lib/email/template";

/**
 * Development-only HTML preview of the order email template.
 * Uses sanitized sample data — never real credentials, order secrets,
 * or client/query-parameter installation values.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  // Ignore any query parameters for QR content — sample payload only.
  void req.nextUrl.searchParams;

  const sample = getSampleOrderEmailPayload();
  const installValue = resolveInstallQrValue(sample);
  const qrImageSrc = installValue
    ? await generateEsimQrDataUrl(installValue)
    : null;

  const html = renderOrderEmailHtml(sample, {
    qrImageSrc: qrImageSrc || undefined,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
