/**
 * Public Tawk widget identifiers (embedded in the browser script URL).
 * Never put SMTP or account secrets here.
 *
 * NEXT_PUBLIC_* values are inlined at build time. Keep a validated public
 * fallback so the bubble still loads when env is empty / redacted / mistyped.
 */

/** MAP eSIM public Tawk property (Administration → Chat Widget). */
const TAWK_PROPERTY_ID_FALLBACK = "6a737ce2941ab01d456d6a82";
/** MAP eSIM public Tawk widget id. */
const TAWK_WIDGET_ID_FALLBACK = "1jv9hvls3";

function readPublicId(raw: string | undefined | null): string {
  const value = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!value) return "";
  // Reject redacted / placeholder values from env dumps.
  if (/sensitive|placeholder|changeme|your[_-]?id/i.test(value)) return "";
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return "";
  return value;
}

export function getTawkPropertyId(): string {
  return (
    readPublicId(process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID) ||
    TAWK_PROPERTY_ID_FALLBACK
  );
}

export function getTawkWidgetId(): string {
  return (
    readPublicId(process.env.NEXT_PUBLIC_TAWK_WIDGET_ID) ||
    TAWK_WIDGET_ID_FALLBACK
  );
}

export function isTawkConfigured(): boolean {
  return Boolean(getTawkPropertyId() && getTawkWidgetId());
}

export function getTawkEmbedSrc(): string | null {
  const propertyId = getTawkPropertyId();
  const widgetId = getTawkWidgetId();
  if (!propertyId || !widgetId) return null;
  return `https://embed.tawk.to/${propertyId}/${widgetId}`;
}
