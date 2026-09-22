import { NextRequest, NextResponse } from "next/server";
import { buildDownloadableQrFilename } from "@/app/lib/email/format";
import {
  generateEsimQrDataUrl,
  resolveInstallQrValue,
} from "@/app/lib/email/qr";
import { EMAIL_LOGO_PUBLIC_PATH } from "@/app/lib/email/logo";
import {
  getSampleOrderEmailPayload,
  renderOrderEmailHtml,
} from "@/app/lib/email/template";

/**
 * Development-only HTML preview of the order email template.
 * Uses sanitized sample data — never real credentials, order secrets,
 * or client/query-parameter installation values.
 *
 * Production send uses absolute HTTPS `/api/vesim/install/qr?access=…` for the
 * QR <img>. Preview embeds a local data-URL so the QR is visible without a
 * live token, and annotates the production URL shape in HTML comments.
 *
 * Optional scenario switch (layout only):
 *   /api/email/preview
 *   /api/email/preview?scenario=with-iphone-link
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  const scenario = req.nextUrl.searchParams.get("scenario")?.trim() || "";
  const withOfficialIphoneLink = scenario === "with-iphone-link";

  const sample = getSampleOrderEmailPayload({ withOfficialIphoneLink });
  const installValue = resolveInstallQrValue(sample);
  const qrDataUrl = installValue
    ? await generateEsimQrDataUrl(installValue)
    : null;

  const html = renderOrderEmailHtml(sample, {
    // Visible QR for local preview only — production uses sample.qrImageUrl HTTPS.
    qrImageSrc: qrDataUrl || sample.qrImageUrl,
    hasQrAttachment: Boolean(qrDataUrl),
    logoImageSrc: EMAIL_LOGO_PUBLIC_PATH,
  });

  const productionUrlNote = sample.qrImageUrl
    ? `<!-- production QR img src shape: ${sample.qrImageUrl} -->`
    : "<!-- production QR img src: omitted when access token unavailable -->";

  const attachmentNote = qrDataUrl
    ? `<!-- preview: downloadable attachment filename would be ${buildDownloadableQrFilename(
        sample.destination,
        sample.orderId
      )} -->`
    : "<!-- preview: no QR attachment (missing verified LPA) -->";

  const scenarioNote = `<!-- preview scenario: ${
    withOfficialIphoneLink ? "with-iphone-link" : "default-no-official-iphone-link"
  } -->`;
  const cidBanNote =
    "<!-- production must not use cid: for QR HTML img (Gmail/Outlook) -->";

  return new NextResponse(
    `${scenarioNote}\n${productionUrlNote}\n${cidBanNote}\n${attachmentNote}\n${html}`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );
}
