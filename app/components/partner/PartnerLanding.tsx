import Link from "next/link";
import { headers } from "next/headers";
import {
  Globe2,
  KeyRound,
  FlaskConical,
  Percent,
  Wallet,
  Zap,
} from "lucide-react";
import {
  isLocalDevHost,
  MAP_DOMAIN_QUERY,
  SANDBOX_SITE_ORIGIN,
} from "@/app/lib/domain/appDomain";

const PILLARS = [
  {
    title: "Instant REST API",
    body: "Provision eSIMs over HTTPS with Bearer keys under /api/v1/partner.",
    icon: Zap,
  },
  {
    title: "Real-time partner wallet",
    body: "Prepaid USD balance, live debits on purchase, top-ups in the portal.",
    icon: Wallet,
  },
  {
    title: "Wholesale margins",
    body: "Partner pricing with automatic discount BPS on catalog & checkout.",
    icon: Percent,
  },
  {
    title: "200+ destinations",
    body: "Global coverage mirrored from the live wholesale catalog.",
    icon: Globe2,
  },
  {
    title: "Interactive sandbox",
    body: "Mock keys, QR codes, and storefront flows on mapesim.store — zero risk.",
    icon: FlaskConical,
  },
] as const;

const CATALOG_SNIPPET = `curl -s https://partneresim.com/api/v1/partner/destinations \\
  -H "Authorization: Bearer pk_live_•••"

# → { "success": true, "destinations": [ { "slug": "japan", … } ] }`;

const ORDER_SNIPPET = `curl -s -X POST https://partneresim.com/api/v1/partner/checkout/credit \\
  -H "Authorization: Bearer pk_live_•••" \\
  -H "Content-Type: application/json" \\
  -d '{ "offerId": "offer_…", "quantity": 1 }'

# → { "success": true, "orderId": "…", "iccid": "…", "qr": … }`;

export default async function PartnerLanding() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const sandboxHref = isLocalDevHost(host)
    ? `/?${MAP_DOMAIN_QUERY}=mapesim.store`
    : SANDBOX_SITE_ORIGIN;

  return (
    <div
      className="min-h-screen w-full bg-[#070D19] text-slate-100"
      style={{
        fontFamily:
          '"Segoe UI Variable", "Segoe UI", "Helvetica Neue", sans-serif',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -right-16 top-40 h-[22rem] w-[22rem] rounded-full bg-lime-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <header className="relative z-10 border-b border-white/[0.06] bg-[#070D19]/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-sm font-black text-slate-950">
              P
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-50">
                Partner eSIM
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400">
                B2B &amp; API Hub
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/signin"
              className="inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.05]"
            >
              Partner Sign In
            </Link>
            <Link
              href="/contact?topic=partner"
              className="hidden h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 sm:inline-flex"
            >
              Apply
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <section className="max-w-3xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Wholesale connectivity platform
          </p>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-50 sm:text-5xl lg:text-[3.25rem]">
            Wholesale eSIM API &amp; B2B Partner Hub
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Issue eSIMs programmatically, manage a prepaid partner wallet, and
            run a white-label experience — with a live sandbox before you go to
            production.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/signin"
              className="inline-flex h-12 items-center rounded-xl bg-emerald-500 px-6 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Partner Sign In
            </Link>
            <Link
              href="/contact?topic=partner"
              className="inline-flex h-12 items-center rounded-xl border border-white/[0.14] bg-white/[0.03] px-6 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.06]"
            >
              Apply for Partner Account
            </Link>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"
            >
              <pillar.icon
                className="h-5 w-5 text-emerald-400"
                aria-hidden
              />
              <h2 className="mt-3 text-base font-semibold text-slate-50">
                {pillar.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                {pillar.body}
                {pillar.title === "Interactive sandbox" ? (
                  <>
                    {" "}
                    <a
                      href={sandboxHref}
                      className="font-semibold text-emerald-400 hover:text-emerald-300"
                      rel="noreferrer"
                    >
                      Open mapesim.store →
                    </a>
                  </>
                ) : null}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-16 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
              Live API shape
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-50">
              Real <code className="text-emerald-300">/api/v1/partner</code>{" "}
              endpoints
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Snippets mirror production Partner API paths (destinations catalog
              + credit checkout). Try the same shapes safely on the sandbox.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <pre className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950 p-4 text-[11px] leading-relaxed text-emerald-100/90 sm:text-xs">
              <code>{CATALOG_SNIPPET}</code>
            </pre>
            <pre className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950 p-4 text-[11px] leading-relaxed text-emerald-100/90 sm:text-xs">
              <code>{ORDER_SNIPPET}</code>
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}
