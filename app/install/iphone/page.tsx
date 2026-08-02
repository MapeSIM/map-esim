import Link from "next/link";
import { Smartphone } from "lucide-react";

export default function IphoneInstallGuidePage() {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-16 text-[var(--heading)] sm:px-6">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10">
          <Smartphone className="h-6 w-6 text-[var(--accent-strong)]" />
        </div>

        <h1 className="mt-5 text-3xl font-bold tracking-tight">
          iPhone eSIM installation guide
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
          Use the verified QR code or manual SM-DP+ details from your MAP-eSIM
          order email or success page. A one-tap Install on iPhone button appears
          only when your order includes an official carrier activation link.
        </p>

        <ol className="mt-8 list-decimal space-y-4 pl-5 text-sm leading-relaxed text-[var(--text)]">
          <li>
            Download or save the MAP-eSIM QR PNG from your order email attachment
            or the success page download button.
          </li>
          <li>
            Open <strong>Settings → Cellular</strong> (or{" "}
            <strong>Mobile Service</strong>) → <strong>Add eSIM</strong>.
          </li>
          <li>
            Choose <strong>Use QR Code</strong>. Scan the saved image from another
            screen when your iPhone cannot scan from its own Photos library.
          </li>
          <li>
            On iOS 17.4 or later, you can also press and hold the QR code in Mail
            or Safari and select <strong>Add eSIM</strong>, then follow Apple’s
            Allow / Continue confirmation.
          </li>
          <li>
            If QR scanning is unavailable, choose Enter Details Manually and use
            the SM-DP+ address and activation code from your order.
          </li>
          <li>
            After arriving at your destination, enable the eSIM line and turn on
            Data Roaming for that line.
          </li>
        </ol>

        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]">
          Need help? Contact{" "}
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
