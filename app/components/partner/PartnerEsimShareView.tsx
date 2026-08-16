"use client";

import { useCallback, useState } from "react";
import { Copy, RefreshCw, Signal, Smartphone, Wifi } from "lucide-react";
import type { PartnerEsimSharePageData } from "@/app/lib/partner/partnerEsimShareRead";

const INSTALL_STEPS = [
  "Scan the QR code or enter the manual details on your device",
  "Review and confirm the eSIM installation",
  "Wait for activation to finish",
  "Enable or select this eSIM for mobile data",
  "Turn on data roaming for this eSIM",
] as const;

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

function CopyRow({
  label,
  value,
  buttonStyle,
}: {
  label: string;
  value: string;
  buttonStyle?: BrandButtonStyle;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
        {label}
      </p>
      <div className="mt-1 flex min-w-0 items-start gap-2">
        <p className="min-w-0 flex-1 break-all font-mono text-sm text-[var(--heading)]">
          {value}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--border-strong)] px-2.5 text-xs font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          style={buttonStyle}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
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
  const ctaStyle = brandButtonStyle(data);

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

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[var(--heading)]">
            {data.destinationName}
          </h2>
          <span className="rounded-full border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 px-3 py-1 text-xs font-semibold text-[var(--heading)]">
            {data.statusLabel}
          </span>
        </div>
        <p className="text-sm font-semibold text-[var(--heading)]">
          {data.planName}
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          {data.dataAllowance} · {data.validity}
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-[var(--accent-strong)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--heading)]">
            Install your eSIM
          </h2>
        </div>
        {data.installDetailsAvailable && data.qrDataUrl ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
            {/* data URL — never a /share/<token> image path */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.qrDataUrl}
              alt="eSIM installation QR code"
              width={280}
              height={280}
              className="mx-auto h-auto w-full max-w-[260px] sm:max-w-[280px]"
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
      </section>

      {data.smdpAddress || data.activationCode || data.lpa ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-[var(--accent-strong)]" aria-hidden="true" />
            <h2 className="text-base font-bold text-[var(--heading)]">
              Manual installation details
            </h2>
          </div>
          {data.smdpAddress ? (
            <CopyRow
              label="SM-DP+ address"
              value={data.smdpAddress}
              buttonStyle={ctaStyle}
            />
          ) : null}
          {data.activationCode ? (
            <CopyRow
              label="Activation code"
              value={data.activationCode}
              buttonStyle={ctaStyle}
            />
          ) : null}
          {data.lpa ? (
            <CopyRow
              label="LPA / full activation value"
              value={data.lpa}
              buttonStyle={ctaStyle}
            />
          ) : null}
        </section>
      ) : null}

      {data.fullIccid ? (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--heading)]">ICCID</h2>
          <CopyRow
            label="Full ICCID"
            value={data.fullIccid}
            buttonStyle={ctaStyle}
          />
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Signal className="h-4 w-4 text-[var(--accent-strong)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--heading)]">
            Check usage
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void loadUsage()}
          disabled={usageLoading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] outline-none hover:bg-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 sm:w-auto"
          style={ctaStyle}
        >
          <RefreshCw
            className={`h-4 w-4 ${usageLoading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {usageLoading ? "Checking…" : "Check usage"}
        </button>
        {usageError ? (
          <p className="text-sm text-[var(--text-muted)]" role="status">
            {usageError}
          </p>
        ) : null}
        {usage ? (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-[var(--heading)]">
              {usage.statusLabel}
            </p>
            <p className="text-[var(--text-muted)]">
              {usage.isUnlimited
                ? "Unlimited data"
                : `${formatGb(usage.remainingDataGB)} remaining of ${formatGb(usage.initialDataGB)}`}
            </p>
            {usage.usagePercentForBar !== null ? (
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--accent-strong)]"
                  style={{ width: `${Math.min(100, usage.usagePercentForBar)}%` }}
                />
              </div>
            ) : null}
            {usage.daysRemaining !== null ? (
              <p className="text-[var(--text-muted)]">
                {usage.daysRemaining} days remaining
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--heading)]">
          Installation guide
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--text-muted)]">
          {INSTALL_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/install/iphone"
            rel="noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            iPhone guide
          </a>
          <a
            href="/install/android"
            rel="noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            Android guide
          </a>
        </div>
      </section>

      {data.branding.supportEmail || data.branding.websiteUrl ? (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--heading)]">
            Partner support
          </h2>
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
                Mail Support
              </a>
            ) : null}
            {data.branding.websiteUrl ? (
              <a
                href={data.branding.websiteUrl}
                target="_blank"
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
                Visit Partner Website
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
