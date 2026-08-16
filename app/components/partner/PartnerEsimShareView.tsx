"use client";

import { useCallback, useState } from "react";
import { RefreshCw, Share2 } from "lucide-react";
import AppleOneTapInstallButton, {
  AppleOneTapSafariGuidance,
  useAppleOneTapInstallState,
} from "@/app/components/install/AppleOneTapInstallButton";
import CopyInstallField from "@/app/components/install/CopyInstallField";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import type { PartnerEsimSharePageData } from "@/app/lib/partner/partnerEsimShareRead";
import { ONE_TAP_FALLBACK } from "@/app/lib/install/progressiveInstallCopy";
import Link from "next/link";

type UsagePayload = {
  statusLabel: string;
  initialDataGB: number | null;
  remainingDataGB: number | null;
  usedDataGB: number | null;
  usagePercentForBar: number | null;
  isUnlimited: boolean;
  daysRemaining: number | null;
  expiresAt: string | null;
};

type BrandButtonStyle = {
  backgroundColor?: string;
  color?: string;
} | undefined;

type Props = {
  token: string;
  data: PartnerEsimSharePageData;
};

function brandButtonStyle(data: PartnerEsimSharePageData): BrandButtonStyle {
  const bg = data.branding.buttonBackground;
  const fg = data.branding.buttonTextColor;
  if (!bg || !fg) return undefined;
  return { backgroundColor: bg, color: fg };
}

function formatGb(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return `${value} GB`;
  return `${value.toFixed(2)} GB`;
}

export default function PartnerEsimShareView({ token, data }: Props) {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const ctaStyle = brandButtonStyle(data);
  const appleOneTap = useAppleOneTapInstallState(data.lpa);
  const eligibleIphone = Boolean(appleOneTap.href);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const res = await fetch(
        `/api/share/${encodeURIComponent(token)}/usage`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "omit",
          headers: { Accept: "application/json" },
        }
      );
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        usage?: UsagePayload;
      } | null;
      if (!res.ok || !json?.success || !json.usage) {
        setUsage(null);
        setUsageError(
          json?.error ||
            "Usage is temporarily unavailable. Please try again later."
        );
        return;
      }
      setUsage({
        statusLabel: String(json.usage.statusLabel || "Unknown"),
        initialDataGB:
          typeof json.usage.initialDataGB === "number"
            ? json.usage.initialDataGB
            : null,
        remainingDataGB:
          typeof json.usage.remainingDataGB === "number"
            ? json.usage.remainingDataGB
            : null,
        usedDataGB:
          typeof json.usage.usedDataGB === "number"
            ? json.usage.usedDataGB
            : null,
        usagePercentForBar:
          typeof json.usage.usagePercentForBar === "number"
            ? json.usage.usagePercentForBar
            : null,
        isUnlimited: Boolean(json.usage.isUnlimited),
        daysRemaining:
          typeof json.usage.daysRemaining === "number"
            ? json.usage.daysRemaining
            : null,
        expiresAt:
          typeof json.usage.expiresAt === "string" ? json.usage.expiresAt : null,
      });
    } catch {
      setUsage(null);
      setUsageError("Usage is temporarily unavailable. Please try again later.");
    } finally {
      setUsageLoading(false);
    }
  }, [token]);

  async function sharePage() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: data.planName, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2000);
      } catch {
        setShareCopied(false);
      }
    }
  }

  return (
    <div className="space-y-4">
      {data.installDetailsAvailable && data.qrDataUrl ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
          {/* data URL — never a /share/<token> image path */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.qrDataUrl}
            alt="eSIM installation QR code"
            width={240}
            height={240}
            className="mx-auto h-auto w-full max-w-[220px] sm:max-w-[240px]"
          />
        </div>
      ) : (
        <p
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-sm text-[var(--text-muted)]"
          role="status"
        >
          Installation details are not available yet.
        </p>
      )}

      {eligibleIphone ? (
        <AppleOneTapInstallButton
          href={appleOneTap.href!}
          label="One-Tap Install eSIM"
        />
      ) : null}

      {appleOneTap.showSafariGuidance && !eligibleIphone ? (
        <AppleOneTapSafariGuidance />
      ) : null}

      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        {eligibleIphone
          ? ONE_TAP_FALLBACK
          : "Scan the QR code or open Manual Install to add this eSIM."}
      </p>

      {data.fullIccid ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
          <CopyInstallField label="ICCID" value={data.fullIccid} />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void loadUsage()}
        disabled={usageLoading}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] outline-none hover:bg-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
        style={ctaStyle}
      >
        <RefreshCw
          className={`h-4 w-4 ${usageLoading ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {usageLoading ? "Checking…" : "Check Usage"}
      </button>
      {usageError ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          {usageError}
        </p>
      ) : null}
      {usage ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
          <p className="text-sm font-semibold text-[var(--heading)]">
            {usage.statusLabel}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <dt className="text-xs text-[var(--text-soft)]">Used</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {usage.isUnlimited ? "—" : formatGb(usage.usedDataGB)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-soft)]">Remaining</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {usage.isUnlimited ? "Unlimited" : formatGb(usage.remainingDataGB)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-soft)]">Total</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {usage.isUnlimited ? "Unlimited" : formatGb(usage.initialDataGB)}
              </dd>
            </div>
          </dl>
          {usage.daysRemaining !== null ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {usage.daysRemaining} days remaining
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <ManualInstallSheet
          smdpAddress={data.smdpAddress}
          activationCode={data.activationCode}
          lpa={data.lpa}
        />
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          Installation Guide
        </button>
      </div>

      <EsimActionSheet
        open={guideOpen}
        title="Installation Guide"
        onClose={() => setGuideOpen(false)}
      >
        <div className="flex flex-col gap-2">
          <Link
            href="/install/iphone"
            rel="noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            iPhone guide
          </Link>
          <Link
            href="/install/android"
            rel="noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Android guide
          </Link>
        </div>
      </EsimActionSheet>

      <button
        type="button"
        onClick={() => void sharePage()}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {shareCopied ? "Copied" : "Share eSIM"}
      </button>

      {data.branding.supportEmail || data.branding.websiteUrl ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {data.branding.supportEmail ? (
            <a
              href={`mailto:${data.branding.supportEmail}`}
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              style={
                ctaStyle ?? {
                  backgroundColor: "var(--accent-strong)",
                  color: "var(--accent-ink)",
                }
              }
            >
              Support
            </a>
          ) : null}
          {data.branding.websiteUrl ? (
            <a
              href={data.branding.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              Visit website
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
