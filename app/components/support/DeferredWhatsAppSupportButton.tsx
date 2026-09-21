"use client";

import dynamic from "next/dynamic";

/**
 * Defers WhatsApp FAB JS off the root layout critical path.
 * Behavior stays in WhatsAppSupportButton (routes, config fetch, Tawk independence).
 */
const WhatsAppSupportButton = dynamic(
  () => import("@/app/components/support/WhatsAppSupportButton"),
  { ssr: false }
);

export default function DeferredWhatsAppSupportButton() {
  return <WhatsAppSupportButton />;
}
