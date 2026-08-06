"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Copy, Download, Eye, Smartphone, X } from "lucide-react";

type InstallPayload = {
  hasInstallDetails: boolean;
  hasVerifiedLpa: boolean;
  hasOfficialIphoneActivationUrl: boolean;
  hasOfficialAndroidActivationUrl: boolean;
  iphoneInstallHref: string | null;
  iphoneGuideHref: string;
  qrDownloadHref: string | null;
  qrViewHref: string | null;
  androidGuideHref: string;
  androidActivationUrl: string | null;
  smdpAddress: string | null;
  activationCode: string | null;
  lpa: string | null;
};

type Props = {
  orderId: string;
  installEligible: boolean;
  isRefunded: boolean;
};

export default function CustomerEsimInstallPanel({
  orderId,
  installEligible,
  isRefunded,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallPayload | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadInstall = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/orders/${encodeURIComponent(orderId)}/install`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        }
      );
      const json = (await res.json().catch(() => null)) as
        | (InstallPayload & { success?: boolean; error?: string })
        | null;
      if (!res.ok || !json?.success) {
        setData(null);
        setError(
          json?.error ||
            "Installation details are not available for this order."
        );
        return;
      }
      setData({
        hasInstallDetails: Boolean(json.hasInstallDetails),
        hasVerifiedLpa: Boolean(json.hasVerifiedLpa),
        hasOfficialIphoneActivationUrl: Boolean(
          json.hasOfficialIphoneActivationUrl
        ),
        hasOfficialAndroidActivationUrl: Boolean(
          json.hasOfficialAndroidActivationUrl
        ),
        iphoneInstallHref: json.iphoneInstallHref,
        iphoneGuideHref: json.iphoneGuideHref || "/install/iphone",
        qrDownloadHref: json.qrDownloadHref,
        qrViewHref: json.qrViewHref,
        androidGuideHref: json.androidGuideHref || "/install/android",
        androidActivationUrl: json.androidActivationUrl,
        smdpAddress: json.smdpAddress,
        activationCode: json.activationCode,
        lpa: json.lpa,
      });
    } catch {
      setData(null);
      setError("Installation details are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setCopiedKey(null);
    }
  }

  if (isRefunded) {
    return (
      <section
        className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-5"
        role="status"
      >
        <h2 className="text-base font-bold text-[var(--heading)]">
          Order refunded
        </h2>
        <p className="mt-2 text-sm text-[var(--danger-text)]">
          Installation is no longer available for this order. QR codes and
          activation actions are disabled.
        </p>
      </section>
    );
  }

  if (!installEligible) {
    return (
      <section
        className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-5"
        role="status"
      >
        <h2 className="text-base font-bold text-[var(--heading)]">
          Installation unavailable
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Installation options appear when this eSIM order is completed and
          ready. If you expected them here, contact support with your order
          reference.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[var(--border-hover)] bg-[var(--surface-2)] p-5">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
          <div>
            <h2 className="text-base font-bold text-[var(--heading)]">
              Installation
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Install the eSIM only when you are ready to use it. Sensitive
              details load only after you choose an action below.
            </p>
          </div>
        </div>

        {!data ? (
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => void loadInstall()}
              disabled={loading}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Loading…" : "Show installation options"}
            </button>
            {error ? (
              <p className="text-sm text-[var(--danger-text)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {data.hasOfficialIphoneActivationUrl && data.iphoneInstallHref ? (
              <a
                href={data.iphoneInstallHref}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                Install on iPhone
              </a>
            ) : (
              <Link
                href={data.iphoneGuideHref}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                View iPhone installation guide
              </Link>
            )}

            {data.hasVerifiedLpa && data.qrViewHref ? (
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                <Eye className="h-4 w-4" />
                View QR Code
              </button>
            ) : null}

            {data.hasVerifiedLpa && data.qrDownloadHref ? (
              <a
                href={data.qrDownloadHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                <Download className="h-4 w-4" />
                Download QR Code
              </a>
            ) : null}

            {data.androidActivationUrl ? (
              <a
                href={data.androidActivationUrl}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                Open Android activation link
              </a>
            ) : null}

            <Link
              href={data.androidGuideHref}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              View Android installation guide
            </Link>

            {(data.smdpAddress || data.activationCode || data.lpa) && (
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
                <p className="font-bold text-[var(--heading)]">
                  Manual installation details
                </p>
                {data.smdpAddress ? (
                  <ManualRow
                    label="SM-DP+ address"
                    value={data.smdpAddress}
                    copied={copiedKey === "smdp"}
                    onCopy={() => void copyText("smdp", data.smdpAddress!)}
                  />
                ) : null}
                {data.activationCode ? (
                  <ManualRow
                    label="Activation code"
                    value={data.activationCode}
                    copied={copiedKey === "activation"}
                    onCopy={() =>
                      void copyText("activation", data.activationCode!)
                    }
                  />
                ) : null}
                {data.lpa ? (
                  <ManualRow
                    label="LPA string"
                    value={data.lpa}
                    copied={copiedKey === "lpa"}
                    onCopy={() => void copyText("lpa", data.lpa!)}
                  />
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {showQrModal && data?.qrViewHref ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="eSIM QR code"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-hover)] bg-[var(--surface)] p-5 shadow-[var(--shadow-strong)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[var(--heading)]">
                  eSIM QR code
                </h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Install the eSIM only when you are ready to use it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                aria-label="Close QR code"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 rounded-2xl bg-white p-4">
              <Image
                src={data.qrViewHref}
                alt="eSIM installation QR code"
                width={280}
                height={280}
                unoptimized
                className="mx-auto h-auto w-[280px] max-w-full"
              />
            </div>
            <div className="mt-4 grid gap-2">
              {data.qrDownloadHref ? (
                <a
                  href={data.qrDownloadHref}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                >
                  <Download className="h-4 w-4" />
                  Download QR
                </a>
              ) : null}
              {(data.smdpAddress || data.activationCode || data.lpa) && (
                <button
                  type="button"
                  onClick={() => {
                    const parts = [
                      data.smdpAddress
                        ? `SM-DP+: ${data.smdpAddress}`
                        : null,
                      data.activationCode
                        ? `Activation code: ${data.activationCode}`
                        : null,
                      data.lpa ? `LPA: ${data.lpa}` : null,
                    ].filter(Boolean);
                    void copyText("manual-all", parts.join("\n"));
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                >
                  <Copy className="h-4 w-4" />
                  {copiedKey === "manual-all"
                    ? "Copied manual details"
                    : "Copy manual details"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ManualRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          {label}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="break-all font-medium text-[var(--heading)]">{value}</p>
    </div>
  );
}
