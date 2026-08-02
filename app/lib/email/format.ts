/**
 * Safe display / filename helpers for order emails.
 * Never log sensitive install values from these helpers.
 */

/** Masks an order ID for customer-facing email content. */
export function maskOrderReference(orderId: string): string {
  const id = orderId.trim();
  if (!id) return "—";

  const uuidMatch = id.match(
    /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i
  );
  if (uuidMatch) {
    return `${uuidMatch[1]}-****-****-****-${uuidMatch[5]}`;
  }

  if (id.length <= 8) return "****";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function sanitizeFilenamePart(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

/**
 * Downloadable QR filename:
 * MAP-eSIM-{destination}-{masked-order-reference}-QR.png
 */
export function buildDownloadableQrFilename(
  destination: string,
  orderId: string
): string {
  const dest = sanitizeFilenamePart(destination, "Destination");
  const masked = sanitizeFilenamePart(maskOrderReference(orderId), "Order");
  return `MAP-eSIM-${dest}-${masked}-QR.png`;
}

/** Customer-facing destination line, e.g. "Pakistan eSIM". */
export function formatDestinationHeadline(destination: string): string {
  const value = destination.trim() || "Your";
  if (/esim/i.test(value)) return value;
  return `${value} eSIM`;
}
