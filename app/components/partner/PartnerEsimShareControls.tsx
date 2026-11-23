"use client";

import { useState } from "react";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import {
  partnerPrimaryCtaClass,
  partnerSecondaryCtaClass,
} from "@/app/components/partner/partnerPortalUi";
import { createOrRegeneratePartnerShareLinkAction } from "@/app/lib/partner/partnerShareLinkActions";
import {
  assertSafeSharePayload,
  buildAbsoluteShareUrl,
  buildPartnerShareClipboardText,
  buildPartnerWebSharePayload,
  buildPartnerWhatsAppShareHref,
} from "@/app/lib/partner/partnerShareCopy";

type Props = {
  orderId: string;
  hasActiveToken: boolean;
  /** Partner share-settings company name (optional; MAP fallback in copy). */
  partnerDisplayName?: string | null;
  destination: string | null;
  planName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  compact?: boolean;
};

export default function PartnerEsimShareControls({
  orderId,
  hasActiveToken,
  partnerDisplayName = null,
  destination,
  planName,
  dataAllowance,
  validity,
  compact = false,
}: Props) {
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Track whether a token exists so empty-state copy stays accurate after first create.
  const [hasToken, setHasToken] = useState(hasActiveToken);

  function currentShareUrl(): string | null {
    if (!sharePath) return null;
    try {
      return buildAbsoluteShareUrl(sharePath, window.location.origin);
    } catch {
      return null;
    }
  }

  function shareCopyInput(shareUrl: string) {
    return {
      shareUrl,
      partnerDisplayName,
      destination,
      planName,
      dataAllowance,
      validity,
    };
  }

  /** Ensure a fresh share URL is available (creates or rotates silently). */
  async function ensureShareUrl(): Promise<string | null> {
    const existing = currentShareUrl();
    if (existing) return existing;

    setBusy(true);
    setError(null);
    setMessage(null);
    setCopied(false);
    try {
      const result = await createOrRegeneratePartnerShareLinkAction(orderId);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      setSharePath(result.sharePath);
      setHasToken(true);
      setMessage(
        result.rotated
          ? "Share link ready. The previous link no longer works."
          : "Share link ready. Copy or send it now — it cannot be recovered later."
      );
      try {
        return buildAbsoluteShareUrl(result.sharePath, window.location.origin);
      } catch {
        setError("Share link is temporarily unavailable.");
        return null;
      }
    } catch {
      setError("Share link is temporarily unavailable.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = await ensureShareUrl();
    if (!url) return;
    try {
      const text = buildPartnerShareClipboardText(shareCopyInput(url));
      assertSafeSharePayload(text);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the share message.");
    }
  }

  async function webShare() {
    const url = await ensureShareUrl();
    if (!url) return;
    const payload = buildPartnerWebSharePayload(shareCopyInput(url));
    try {
      assertSafeSharePayload(payload.text);
      assertSafeSharePayload(payload.title);
      assertSafeSharePayload(payload.url);
      if (typeof navigator.share === "function") {
        await navigator.share(payload);
        return;
      }
      const text = buildPartnerShareClipboardText(shareCopyInput(url));
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const text = buildPartnerShareClipboardText(shareCopyInput(url));
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setError("Sharing is unavailable on this device.");
      }
    }
  }

  async function openWhatsApp() {
    const url = await ensureShareUrl();
    if (!url) return;
    const href = buildPartnerWhatsAppShareHref(shareCopyInput(url));
    if (!href) {
      setError("WhatsApp share is unavailable.");
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  const shareUrl = currentShareUrl();

  const body = (
    <div className="min-w-0 space-y-4">
      {shareUrl ? (
        <p className="break-all rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--heading)]">
          {shareUrl}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          {hasToken
            ? "A share link exists for this eSIM. Use Copy, WhatsApp, or Web Share to get a fresh link you can send."
            : "Use Copy, WhatsApp, or Web Share to create a secure link for this eSIM."}
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={busy}
          className={`${partnerPrimaryCtaClass} sm:w-auto`}
        >
          {busy ? "Preparing…" : copied ? "Copied" : "Copy Link"}
        </button>
        <button
          type="button"
          onClick={() => void openWhatsApp()}
          disabled={busy}
          className={`${partnerSecondaryCtaClass} sm:w-auto`}
        >
          WhatsApp Share
        </button>
        <button
          type="button"
          onClick={() => void webShare()}
          disabled={busy}
          className={`${partnerSecondaryCtaClass} sm:w-auto`}
        >
          Web Share
        </button>
      </div>

      {message ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={partnerSecondaryCtaClass}
        >
          Share eSIM
        </button>
        <EsimActionSheet
          open={sheetOpen}
          title="Share eSIM"
          onClose={() => setSheetOpen(false)}
        >
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Share a secure installation link for this completed order. The raw
            link is shown only when you copy or send it.
          </p>
          {body}
        </EsimActionSheet>
      </>
    );
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-5 sm:px-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Share eSIM</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Share a secure installation link for this completed order. The raw
          link is shown only when you copy or send it.
        </p>
      </div>
      {body}
    </section>
  );
}
