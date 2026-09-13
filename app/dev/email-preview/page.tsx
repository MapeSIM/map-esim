/**
 * TEMPORARY DEV-ONLY customer email preview UI.
 * Do not commit. Production → 404. Does not send mail.
 *
 * Open: /dev/email-preview
 * Raw HTML: /api/email/preview/customer?template=...
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  parseDevCustomerEmailPreviewQuery,
  renderDevCustomerEmailPreviewHtml,
} from "@/app/dev/email-preview/render";
import {
  DEV_EMAIL_PREVIEW_TEMPLATES,
  EXPIRY_REMINDER_KINDS,
  REFUND_STATUS_KINDS,
  type DevEmailPreviewTemplateId,
} from "@/app/dev/email-preview/samples";

export const metadata: Metadata = {
  title: "Dev email preview (temporary)",
  robots: { index: false, follow: false },
};

function hrefFor(
  template: DevEmailPreviewTemplateId,
  kind?: string
): string {
  const params = new URLSearchParams({ template });
  if (kind) params.set("kind", kind);
  return `/dev/email-preview?${params.toString()}`;
}

function rawHref(template: DevEmailPreviewTemplateId, kind?: string): string {
  const params = new URLSearchParams({ template });
  if (kind) params.set("kind", kind);
  return `/api/email/preview/customer?${params.toString()}`;
}

export default async function DevEmailPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; kind?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const query = await searchParams;
  const selectedTemplate: DevEmailPreviewTemplateId =
    (DEV_EMAIL_PREVIEW_TEMPLATES.find((t) => t.id === query.template)?.id as
      | DevEmailPreviewTemplateId
      | undefined) ?? "purchase-confirmation";

  const parsed =
    parseDevCustomerEmailPreviewQuery({
      template: selectedTemplate,
      kind: query.kind,
    }) ?? { template: "purchase-confirmation" as const };

  const html = renderDevCustomerEmailPreviewHtml(parsed);
  const activeKind =
    parsed.template === "refund-status"
      ? parsed.refundKind ?? "received"
      : parsed.template === "expiry-reminder"
        ? parsed.lifecycleKind ?? "EXPIRY_SOON_24H"
        : undefined;

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "24px 16px 48px",
        fontFamily: "Segoe UI, Helvetica, Arial, sans-serif",
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#4b5d78",
        }}
      >
        Temporary · dev only · do not commit
      </p>
      <h1 style={{ margin: "0 0 8px", fontSize: 28, color: "#0d1524" }}>
        Customer email UI preview
      </h1>
      <p style={{ margin: "0 0 20px", color: "#4b5d78", lineHeight: 1.5 }}>
        Sample payloads only. Install/QR preview remains at{" "}
        <Link href="/api/email/preview" style={{ color: "#2f6b00" }}>
          /api/email/preview
        </Link>
        .
      </p>

      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {DEV_EMAIL_PREVIEW_TEMPLATES.map((t) => {
          const active = t.id === selectedTemplate;
          return (
            <Link
              key={t.id}
              href={hrefFor(t.id)}
              style={{
                display: "inline-block",
                padding: "8px 12px",
                borderRadius: 999,
                border: active ? "1px solid #06120a" : "1px solid #e2e8f0",
                background: active ? "#7CFF00" : "#ffffff",
                color: "#06120a",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {selectedTemplate === "refund-status" ? (
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {REFUND_STATUS_KINDS.map((kind) => {
            const active = kind === activeKind;
            return (
              <Link
                key={kind}
                href={hrefFor("refund-status", kind)}
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: active ? "1px solid #020817" : "1px solid #e2e8f0",
                  background: active ? "#020817" : "#f8fafc",
                  color: active ? "#ffffff" : "#0d1524",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {kind}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {selectedTemplate === "expiry-reminder" ? (
        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {EXPIRY_REMINDER_KINDS.map((kind) => {
            const active = kind === activeKind;
            return (
              <Link
                key={kind}
                href={hrefFor("expiry-reminder", kind)}
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: active ? "1px solid #020817" : "1px solid #e2e8f0",
                  background: active ? "#020817" : "#f8fafc",
                  color: active ? "#ffffff" : "#0d1524",
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {kind}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#4b5d78" }}>
        Raw HTML:{" "}
        <Link
          href={rawHref(selectedTemplate, activeKind)}
          style={{ color: "#2f6b00", fontWeight: 700 }}
        >
          {rawHref(selectedTemplate, activeKind)}
        </Link>
      </p>

      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          overflow: "hidden",
          background: "#eef2f7",
        }}
      >
        <iframe
          title={`Email preview: ${selectedTemplate}`}
          srcDoc={html}
          style={{
            display: "block",
            width: "100%",
            minHeight: 900,
            border: 0,
            background: "#eef2f7",
          }}
        />
      </div>
    </main>
  );
}
