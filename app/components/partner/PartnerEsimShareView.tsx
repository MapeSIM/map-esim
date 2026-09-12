"use client";

import { useCallback, useState } from "react";
import { RefreshCw, Share2 } from "lucide-react";
import CopyInstallField from "@/app/components/install/CopyInstallField";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import ManualInstallSheet from "@/app/components/install/ManualInstallSheet";
import SmartInstallEsimButton from "@/app/components/install/SmartInstallEsimButton";
import {
  partnerCardClass,
  partnerPrimaryCtaClass,
  partnerQuietCtaClass,
  partnerSecondaryCtaClass,
  partnerSectionLabelClass,
} from "@/app/components/partner/partnerPortalUi";
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
    <div className="space-y-5">
      {data.installDetailsAvailable && data.qrDataUrl ? (
        <section className={partnerCardClass}>
          <p className={partnerSectionLabelClass}>QR code</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Scan this code with another phone if you are not installing on this
            device.
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-4">
            {/* data URL — never a /share/<token> image path */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.qrDataUrl}
              alt="eSIM installation QR code"
              width={200}
              height={200}
              className="mx-auto h-auto w-full max-w-[180px] sm:max-w-[200px]"
            />
          </div>
        </section>
      ) : (
        <p
          className={`${partnerCardClass} text-sm text-[var(--text-muted)]`}
          role="status"
        >
          Installation details are not available yet.
        </p>
      )}

      {data.installDetailsAvailable ? (
        <section className={partnerCardClass}>
          <p className={partnerSectionLabelClass}>Install</p>
          <h2 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
            Start installation
          </h2>
          <div className="mt-4">
            <SmartInstallEsimButton
              activationLpa={data.lpa}
              qrViewHref={data.qrDataUrl}
              smdpAddress={data.smdpAddress}
              activationCode={data.activationCode}
              className={partnerPrimaryCtaClass}
              style={ctaStyle}
            />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            {ONE_TAP_FALLBACK}
          </p>
          <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-[var(--text)]">
            <li>1. Tap Install eSIM on this phone.</li>
            <li>2. If nothing opens, scan the QR code with another device.</li>
            <li>3. Still stuck? Use Manual Install or the Installation Guide.</li>
          </ol>
        </section>
      ) : null}

      {data.fullIccid ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
          <CopyInstallField label="ICCID" value={data.fullIccid} />
        </div>
      ) : null}

      <section className={partnerCardClass}>
        <p className={partnerSectionLabelClass}>Need another option?</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ManualInstallSheet
            smdpAddress={data.smdpAddress}
            activationCode={data.activationCode}
            lpa={data.lpa}
            buttonClassName={partnerSecondaryCtaClass}
          />
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className={partnerSecondaryCtaClass}
          >
            Installation Guide
          </button>
        </div>
      </section>

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
            className={partnerSecondaryCtaClass}
          >
            iPhone guide
          </Link>
          <Link
            href="/install/android"
            rel="noreferrer"
            referrerPolicy="no-referrer"
            className={partnerSecondaryCtaClass}
          >
            Android guide
          </Link>
        </div>
      </EsimActionSheet>

      <section className={partnerCardClass}>
        <p className={partnerSectionLabelClass}>Usage</p>
        <button
          type="button"
          onClick={() => void loadUsage()}
          disabled={usageLoading}
          className={`mt-4 ${partnerSecondaryCtaClass}`}
        >
          <RefreshCw
            className={`h-4 w-4 ${usageLoading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {usageLoading ? "Checking…" : "Check Usage"}
        </button>
        {usageError ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]" role="status">
            {usageError}
          </p>
        ) : null}
        {usage ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
            <p className="text-sm font-semibold text-[var(--heading)]">
              {usage.statusLabel}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2">
                <dt className="text-xs text-[var(--text-soft)]">Used</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {usage.isUnlimited ? "—" : formatGb(usage.usedDataGB)}
                </dd>
              </div>
              <div className="rounded-xl bg-[var(--accent-strong)]/10 px-2 py-2">
                <dt className="text-xs text-[var(--text-soft)]">Remaining</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {usage.isUnlimited ? "Unlimited" : formatGb(usage.remainingDataGB)}
                </dd>
              </div>
              <div className="rounded-xl bg-[var(--surface-2)] px-2 py-2">
                <dt className="text-xs text-[var(--text-soft)]">Total</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {usage.isUnlimited ? "Unlimited" : formatGb(usage.initialDataGB)}
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
      </section>

      <section className={partnerCardClass}>
        <p className={partnerSectionLabelClass}>Share & support</p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => void sharePage()}
            className={partnerSecondaryCtaClass}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {shareCopied ? "Copied" : "Share eSIM"}
          </button>
          {data.branding.supportEmail || data.branding.websiteUrl ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.branding.supportEmail ? (
                <a
                  href={`mailto:${data.branding.supportEmail}`}
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className={partnerQuietCtaClass}
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
                  className={partnerQuietCtaClass}
                >
                  Visit website
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
