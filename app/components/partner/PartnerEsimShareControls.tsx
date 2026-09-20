"use client";

import { useState } from "react";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import {
  partnerDangerCtaClass,
  partnerPrimaryCtaClass,
  partnerSecondaryCtaClass,
} from "@/app/components/partner/partnerPortalUi";
import {
  createOrRegeneratePartnerShareLinkAction,
  revokePartnerShareLinkAction,
} from "@/app/lib/partner/partnerShareLinkActions";
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
  const [active, setActive] = useState(hasActiveToken);
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  async function createOrRegenerate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setCopied(false);
    try {
      const result = await createOrRegeneratePartnerShareLinkAction(orderId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSharePath(result.sharePath);
      setActive(true);
      setMessage(
        result.rotated
          ? "New share link created. The previous link no longer works."
          : "Share link created. Copy it now — it cannot be recovered later."
      );
    } catch {
      setError("Share link is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await revokePartnerShareLinkAction(orderId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSharePath(null);
      setActive(false);
      setMessage("Share link revoked. The link is no longer accessible.");
    } catch {
      setError("Share link is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = currentShareUrl();
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
    const url = currentShareUrl();
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

  const shareUrl = currentShareUrl();
  const whatsappHref = shareUrl
    ? buildPartnerWhatsAppShareHref(shareCopyInput(shareUrl))
    : null;

  const body = (
    <div className="min-w-0 space-y-4">
      {shareUrl ? (
        <p className="break-all rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--heading)]">
          {shareUrl}
        </p>
      ) : active ? (
        <p className="text-sm text-[var(--text-muted)]">
          A share link is already active, but the original URL cannot be
          recovered. Regenerate to create a new link. The old link will stop
          working.
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">
          No active share link for this eSIM yet.
        </p>
      )}

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => void createOrRegenerate()}
          disabled={busy}
          className={`${partnerPrimaryCtaClass} sm:w-auto`}
        >
          {active ? "Regenerate Share Link" : "Create Share Link"}
        </button>
        {shareUrl ? (
          <>
            <button
              type="button"
              onClick={() => void copyLink()}
              disabled={busy}
              className={`${partnerSecondaryCtaClass} sm:w-auto`}
            >
              {copied ? "Copied" : "Copy Link"}
            </button>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className={`${partnerSecondaryCtaClass} sm:w-auto`}
              >
                WhatsApp Share
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void webShare()}
              disabled={busy}
              className={`${partnerSecondaryCtaClass} sm:w-auto`}
            >
              Web Share
            </button>
          </>
        ) : null}
        {active ? (
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={busy}
            className={`${partnerDangerCtaClass} sm:w-auto`}
          >
            Revoke Share Link
          </button>
        ) : null}
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
            Create a secure link for this completed order. This share link stays
            active until you revoke or regenerate it. The raw link is shown only
            once. Regenerating immediately invalidates the old link.
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
          Create a secure link for this completed order. This share link stays
          active until you revoke or regenerate it. The raw link is shown only
          once. Regenerating immediately invalidates the old link.
        </p>
      </div>
      {body}
    </section>
  );
}
