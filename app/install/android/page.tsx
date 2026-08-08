import Link from "next/link";
import { Smartphone } from "lucide-react";

export default function AndroidInstallGuidePage() {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-16 text-[var(--heading)] sm:px-6">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10">
          <Smartphone className="h-6 w-6 text-[var(--accent-strong)]" />
        </div>

        <h1 className="mt-5 text-3xl font-bold tracking-tight">
          Android eSIM installation guide
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
          MAP eSIM does not claim universal one-click Android installation.
          Use the downloadable QR code from your order email or success page,
          then follow the steps for your device.
        </p>

        <ol className="mt-8 list-decimal space-y-4 pl-5 text-sm leading-relaxed text-[var(--text)]">
          <li>
            Download or save the MAP eSIM QR PNG from your order email attachment
            or the success page download button.
          </li>
          <li>
            Open <strong>Settings → Network &amp; Internet → SIMs</strong> (wording
            may vary by manufacturer).
          </li>
          <li>Tap <strong>Add eSIM</strong> or <strong>Download a SIM instead</strong>.</li>
          <li>
            Choose <strong>Use QR code</strong> and scan the saved image from
            another screen or printed copy when your phone cannot scan from its
            own gallery.
          </li>
          <li>
            If QR scanning is unavailable, enter the SM-DP+ address and activation
            code from your order details manually.
          </li>
          <li>
            After you arrive at your destination, enable the eSIM line and turn
            on <strong>Data roaming</strong> for that line.
          </li>
        </ol>

        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]">
          Device menus differ across Samsung, Google Pixel, Xiaomi and others.
          If you get stuck, contact{" "}
          <a
            href="mailto:support@mapesim.com"
            className="font-semibold text-[var(--accent-strong)]"
          >
            support@mapesim.com
          </a>{" "}
          with your masked Order ID.
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/countries"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)]"
          >
            Browse plans
          </Link>
          <a
            href="mailto:support@mapesim.com"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-sm font-semibold"
          >
            Contact support
          </a>
        </div>
      </div>
    </main>
  );
}
