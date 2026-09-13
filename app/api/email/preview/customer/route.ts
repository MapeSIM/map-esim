/**
 * TEMPORARY DEV-ONLY: raw HTML for a customer email template preview.
 * Do not commit. Production returns 404. Does not send mail.
 *
 * Examples:
 *   /api/email/preview/customer?template=purchase-confirmation
 *   /api/email/preview/customer?template=refund-status&kind=completed
 *   /api/email/preview/customer?template=expiry-reminder&kind=EXPIRY_SOON_24H
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseDevCustomerEmailPreviewQuery,
  renderDevCustomerEmailPreviewHtml,
} from "@/app/dev/email-preview/render";
import { DEV_EMAIL_PREVIEW_TEMPLATES } from "@/app/dev/email-preview/samples";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404 }
    );
  }

  const templateParam = req.nextUrl.searchParams.get("template")?.trim() || "";
  const kindParam = req.nextUrl.searchParams.get("kind")?.trim() || "";

  if (!templateParam) {
    return NextResponse.json(
      {
        success: true,
        note: "Temporary customer email HTML preview (dev only).",
        templates: DEV_EMAIL_PREVIEW_TEMPLATES.map((t) => t.id),
        examples: [
          "/api/email/preview/customer?template=purchase-confirmation",
          "/api/email/preview/customer?template=abandoned-checkout",
          "/api/email/preview/customer?template=expiry-reminder&kind=EXPIRY_SOON_24H",
          "/api/email/preview/customer?template=refund-status&kind=completed",
          "/api/email/preview/customer?template=payment-received-pending",
          "/api/email/preview/customer?template=payment-failure",
        ],
        ui: "/dev/email-preview",
      },
      { status: 200 }
    );
  }

  const parsed = parseDevCustomerEmailPreviewQuery({
    template: templateParam,
    kind: kindParam || undefined,
  });
  if (!parsed) {
    return NextResponse.json(
      {
        success: false,
        error: "Unknown template",
        templates: DEV_EMAIL_PREVIEW_TEMPLATES.map((t) => t.id),
      },
      { status: 400 }
    );
  }

  const html = renderDevCustomerEmailPreviewHtml(parsed);
  const note = `<!-- preview template: ${parsed.template}${
    kindParam ? ` kind=${kindParam}` : ""
  } -->`;

  return new NextResponse(`${note}\n${html}`, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
