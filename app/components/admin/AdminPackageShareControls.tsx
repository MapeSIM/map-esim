"use client";

import { useState } from "react";
import {
  buildAbsolutePackageCheckoutUrlFromOffer,
  buildPackageShareWhatsAppHref,
} from "@/app/lib/support/packageShareLink";

type Props = {
  offerId: string;
  country: string;
  destination?: string | null;
  planName?: string | null;
  dataAllowance?: string | null;
  validity?: string | null;
};

/**
 * Admin/support package share controls — customer buy deep link only.
 * Never surfaces purchaseId, providerOrderId, or wallet/payment refs.
 */
export default function AdminPackageShareControls({
  offerId,
  country,
  destination,
  planName,
  dataAllowance,
  validity,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const checkoutUrl = buildAbsolutePackageCheckoutUrlFromOffer(
    { id: offerId },
    country
  );
  const whatsappHref = checkoutUrl
    ? buildPackageShareWhatsAppHref({
        offerId,
        country,
        destination,
        planName,
        dataAllowance,
        validity,
      })
    : null;

  if (!checkoutUrl) return null;

  async function copyLink() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(checkoutUrl!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError("Unable to copy link.");
    }
  }

  return (
    <div
      className="mt-3 flex min-w-0 flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:flex-wrap"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => void copyLink()}
        className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        {copied ? "Copied" : "Copy Link"}
      </button>
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          Share on WhatsApp
        </a>
      ) : null}
      {copyError ? (
        <p className="w-full text-xs text-[var(--danger-text)]" role="alert">
          {copyError}
        </p>
      ) : null}
    </div>
  );
}
