"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { Copy, RefreshCw, Share2 } from "lucide-react";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import SmartInstallEsimButton from "@/app/components/install/SmartInstallEsimButton";
import type { PartnerEsimSharePageData } from "@/app/lib/partner/partnerEsimShareRead";
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

type Props = {
  token: string;
  data: PartnerEsimSharePageData;
};

function formatGb(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return `${value} GB`;
  return `${value.toFixed(2)} GB`;
}

function brandInstallStyle(
  data: PartnerEsimSharePageData
): CSSProperties | undefined {
  const bg = data.branding.buttonBackground;
  const fg = data.branding.buttonTextColor;
  if (!bg || !fg) return undefined;
  return { backgroundColor: bg, color: fg };
}

const installBtnClass =
  "inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60";

const actionBtnClass =
  "inline-flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm font-semibold text-[var(--heading)] outline-none transition hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60";

export default function PartnerEsimShareView({ token, data }: Props) {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [iccidCopied, setIccidCopied] = useState(false);

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

  async function copyIccid() {
    if (!data.fullIccid) return;
    try {
      await navigator.clipboard.writeText(data.fullIccid);
      setIccidCopied(true);
      window.setTimeout(() => setIccidCopied(false), 2000);
    } catch {
      setIccidCopied(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      {data.installDetailsAvailable && data.qrDataUrl ? (
        <div className="flex flex-col items-center">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-3.5">
            {/* data URL — never a /share/<token> image path */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.qrDataUrl}
              alt="eSIM installation QR code"
              width={180}
              height={180}
              className="mx-auto h-auto w-full max-w-[168px]"
            />
          </div>
          <p className="mt-2.5 text-center text-sm font-medium text-[var(--text-muted)]">
            Scan on eSIM device
          </p>
        </div>
      ) : (
        <p
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3 text-center text-sm text-[var(--text-muted)]"
          role="status"
        >
          Installation details are not available yet.
        </p>
      )}

      {data.installDetailsAvailable ? (
        <div className="min-w-0 w-full">
          <SmartInstallEsimButton
            activationLpa={data.lpa}
            qrViewHref={data.qrDataUrl}
            smdpAddress={data.smdpAddress}
            activationCode={data.activationCode}
            className={installBtnClass}
            style={brandInstallStyle(data)}
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
        {data.fullIccid ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                ICCID
              </p>
              <p className="mt-0.5 truncate font-mono text-xs font-medium text-[var(--heading)] sm:text-sm">
                {data.fullIccid}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyIccid()}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--accent-strong)] outline-none transition hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {iccidCopied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">ICCID unavailable</p>
        )}
        <p className="mt-1.5 text-xs font-medium text-[var(--text-muted)]">
          {usage?.statusLabel || data.statusLabel}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => void loadUsage()}
          disabled={usageLoading}
          className={actionBtnClass}
        >
          <RefreshCw
            className={`h-4 w-4 ${usageLoading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {usageLoading ? "Checking…" : "Check Usage"}
        </button>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className={actionBtnClass}
        >
          Installation Guide
        </button>
        <button
          type="button"
          onClick={() => void sharePage()}
          className={actionBtnClass}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {shareCopied ? "Copied" : "Share this page"}
        </button>
        {data.branding.supportEmail ? (
          <a
            href={`mailto:${data.branding.supportEmail}`}
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className={actionBtnClass}
          >
            Contact support
          </a>
        ) : null}
      </div>

      {usageError ? (
        <p className="text-center text-sm text-[var(--text-muted)]" role="status">
          {usageError}
        </p>
      ) : null}
      {usage ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
          <p className="text-sm font-semibold text-[var(--heading)]">
            {usage.statusLabel}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-[var(--surface)] px-2 py-2">
              <dt className="text-xs text-[var(--text-soft)]">Used</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {usage.isUnlimited ? "—" : formatGb(usage.usedDataGB)}
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--accent-strong)]/10 px-2 py-2">
              <dt className="text-xs text-[var(--text-soft)]">Remaining</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {usage.isUnlimited
                  ? "Unlimited"
                  : formatGb(usage.remainingDataGB)}
              </dd>
            </div>
            <div className="rounded-xl bg-[var(--surface)] px-2 py-2">
              <dt className="text-xs text-[var(--text-soft)]">Total</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">
                {usage.isUnlimited
                  ? "Unlimited"
                  : formatGb(usage.initialDataGB)}
              </dd>
            </div>
          </dl>
          {usage.daysRemaining !== null ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {usage.daysRemaining} days remaining
            </p>
          ) : null}
        </div>
      ) : null}

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
            className={actionBtnClass}
          >
            iPhone guide
          </Link>
          <Link
            href="/install/android"
            rel="noreferrer"
            referrerPolicy="no-referrer"
            className={actionBtnClass}
          >
            Android guide
          </Link>
        </div>
      </EsimActionSheet>
    </div>
  );
}
