/**
 * Public Tawk widget identifiers (embedded in the browser script URL).
 * Never put SMTP or account secrets here.
 */

export function getTawkPropertyId(): string {
  return (process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID || "").trim();
}

export function getTawkWidgetId(): string {
  return (process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || "").trim();
}

export function isTawkConfigured(): boolean {
  return Boolean(getTawkPropertyId() && getTawkWidgetId());
}

export function getTawkEmbedSrc(): string | null {
  const propertyId = getTawkPropertyId();
  const widgetId = getTawkWidgetId();
  if (!propertyId || !widgetId) return null;
  // Embed path segments only — reject unexpected characters.
  if (!/^[A-Za-z0-9_-]+$/.test(propertyId) || !/^[A-Za-z0-9_-]+$/.test(widgetId)) {
    return null;
  }
  return `https://embed.tawk.to/${propertyId}/${widgetId}`;
}
