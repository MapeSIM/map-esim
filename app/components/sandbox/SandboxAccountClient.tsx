"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateSandboxTestKey } from "@/app/lib/sandbox/sandboxShared";
import { SANDBOX_API_KEY_KEY } from "@/app/lib/sandbox/sandboxClientStorage";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";
import { BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import SandboxShareBrandingForm from "@/app/components/sandbox/SandboxShareBrandingForm";

export default function SandboxAccountClient() {
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("partner@example.com");

  useEffect(() => {
    try {
      const session = localStorage.getItem("mapesim_sandbox_session");
      if (session) {
        const parsed = JSON.parse(session) as { email?: string };
        if (parsed.email) setEmail(parsed.email);
      }
      let key = localStorage.getItem(SANDBOX_API_KEY_KEY);
      if (!key || !key.startsWith("sb_test_")) {
        key = generateSandboxTestKey();
        localStorage.setItem(SANDBOX_API_KEY_KEY, key);
      }
      setApiKey(key);
    } catch {
      setApiKey(generateSandboxTestKey());
    }
  }, []);

  function mint() {
    const key = generateSandboxTestKey();
    setApiKey(key);
    try {
      localStorage.setItem(SANDBOX_API_KEY_KEY, key);
    } catch {
      /* ignore */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-50">Account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Profile, branding, API keys, and quick actions.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">
              Profile Information
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Partner name
                </dt>
                <dd className="mt-1 text-sm text-slate-100">MAP Partner</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Email
                </dt>
                <dd className="mt-1 text-sm text-slate-100">{email}</dd>
              </div>
            </dl>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-50">
              Share QR Branding
            </h2>
            <p className="text-sm text-slate-400">
              Company details and Install button colors for public share pages.
            </p>
            <SandboxShareBrandingForm />
            <p className="text-xs text-slate-500">
              Preview the white-label page at{" "}
              <Link
                href="/sandbox/share/preview"
                className="font-semibold text-emerald-400 hover:text-emerald-300"
              >
                /sandbox/share/preview
              </Link>
              .
            </p>
          </section>
        </div>

        <div className="space-y-6">
          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">
              Quick Actions
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/sandbox/docs"
                  className="font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  Open API docs →
                </Link>
              </li>
              <li>
                <Link
                  href="/sandbox/wallet"
                  className="font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  Top up wallet →
                </Link>
              </li>
              <li>
                <Link
                  href="/sandbox/catalog"
                  className="font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  Browse catalog →
                </Link>
              </li>
            </ul>
          </section>

          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">
              Account Info
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">API access</dt>
                <dd className="font-semibold text-emerald-300">Enabled</dd>
              </div>
            </dl>
          </section>

          <section className={partnerCardClass + " space-y-4"}>
            <h2 className="text-lg font-semibold text-slate-50">API Keys</h2>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-white/[0.1] bg-slate-950 px-3 py-2.5 font-mono text-xs text-emerald-300">
                {apiKey || "…"}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-3 text-sm font-semibold text-slate-100 hover:bg-white/[0.05]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={mint}
                className="inline-flex h-10 items-center rounded-xl bg-emerald-500 px-3 text-sm font-bold text-slate-950 hover:bg-emerald-400"
              >
                Mint key
              </button>
            </div>
          </section>

          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">Need Help?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Contact Partner support at{" "}
              <a
                href={`mailto:${BRAND_SUPPORT_EMAIL}`}
                className="font-semibold text-emerald-400 hover:text-emerald-300"
              >
                {BRAND_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
