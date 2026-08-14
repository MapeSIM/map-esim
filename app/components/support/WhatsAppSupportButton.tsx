"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  isWhatsAppSupportRoute,
  type PublicWhatsAppSupportConfig,
} from "@/app/lib/support/whatsappSupportShared";

const OFF: PublicWhatsAppSupportConfig = { enabled: false };

function parsePublicConfig(data: unknown): PublicWhatsAppSupportConfig {
  if (!data || typeof data !== "object") return OFF;
  const row = data as Record<string, unknown>;
  if (row.enabled !== true) return OFF;
  const href = typeof row.href === "string" ? row.href : "";
  if (!href.startsWith("https://wa.me/")) return OFF;
  const phone = typeof row.phone === "string" ? row.phone : "";
  const message = typeof row.message === "string" ? row.message : "";
  return { enabled: true, phone, message, href };
}

/**
 * Floating WhatsApp support button (bottom-left).
 * Fetches runtime config on mount and route changes. Renders nothing when off
 * or on disallowed routes. Independent of Tawk / marketing consent.
 */
export default function WhatsAppSupportButton() {
  const pathname = usePathname() || "/";
  const routeOk = isWhatsAppSupportRoute(pathname);
  const [config, setConfig] = useState<PublicWhatsAppSupportConfig>(OFF);

  useEffect(() => {
    if (!routeOk) {
      setConfig(OFF);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch("/api/support/whatsapp", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) setConfig(OFF);
          return;
        }
        const json: unknown = await res.json();
        if (!cancelled) setConfig(parsePublicConfig(json));
      } catch {
        if (!cancelled) setConfig(OFF);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pathname, routeOk]);

  if (!routeOk || !config.enabled) return null;

  return (
    <a
      href={config.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with MAP eSIM on WhatsApp"
      className="fixed z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md transition hover:bg-[#1ebe57] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page-bg)] bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-[max(1.25rem,env(safe-area-inset-left))]"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-7 w-7 fill-current"
      >
        <path d="M12.04 2c-5.46 0-9.91 4.43-9.91 9.88 0 1.74.46 3.44 1.34 4.94L2 22l5.34-1.4a9.9 9.9 0 0 0 4.7 1.2h.01c5.46 0 9.9-4.44 9.9-9.89C21.95 6.43 17.5 2 12.04 2zm5.77 14.13c-.24.68-1.4 1.25-1.94 1.33-.5.08-1.13.11-1.82-.11-.42-.14-.96-.29-1.65-.57-2.9-1.25-4.79-4.17-4.93-4.36-.14-.2-1.15-1.53-1.15-2.92 0-1.39.73-2.07.99-2.36.26-.28.57-.35.76-.35h.55c.17 0 .41-.07.64.49.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.2-.15.32-.29.49-.14.17-.3.38-.43.51-.14.14-.29.29-.12.57.17.28.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.28.14.45.12.61-.07.17-.2.7-.81.88-1.09.19-.28.37-.23.62-.14.26.1 1.64.77 1.92.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
      </svg>
    </a>
  );
}
