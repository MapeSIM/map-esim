"use client";

import { useState } from "react";

type TocItem = { id: string; label: string };

const ENDPOINTS: Array<{
  method: string;
  path: string;
  summary: string;
  request?: string;
  response?: string;
}> = [
  {
    method: "GET",
    path: "/destinations",
    summary: "List active destinations with minimum partner USD price.",
    response: `{
  "success": true,
  "destinations": [{ "code": "PK", "name": "Pakistan", "minPartnerPriceUsd": 4.5 }]
}`,
  },
  {
    method: "GET",
    path: "/offers",
    summary: "Paginated offers (?page=&limit=&country=&region=&search=&fullCatalog=1).",
    response: `{
  "success": true,
  "offers": [{ "offerId": "...", "partnerPriceUsd": 4.5 }],
  "page": 1, "limit": 50, "total": 120
}`,
  },
  {
    method: "GET",
    path: "/offers/{offerId}",
    summary: "Single offer with partner USD price.",
  },
  {
    method: "POST",
    path: "/checkout/quote",
    summary: "Exact partner-discounted unit/total + wallet sufficiency.",
    request: `{ "offerId": "abc", "quantity": 1 }`,
    response: `{
  "success": true,
  "quote": { "totalPriceUsd": 4.5, "sufficientBalance": true }
}`,
  },
  {
    method: "POST",
    path: "/checkout/credit",
    summary: "Idempotent wallet debit + eSIM fulfillment (Idempotency-Key).",
    request: `{ "offerId": "abc", "quantity": 1 }`,
    response: `{
  "success": true,
  "order": { "orderId": "...", "iccid": "...", "lpa": "LPA:1$...", "qrUrl": "..." }
}`,
  },
  {
    method: "GET",
    path: "/orders",
    summary: "List partner orders.",
  },
  {
    method: "GET",
    path: "/orders/{id}",
    summary: "Order detail with ICCID / QR / LPA.",
  },
  {
    method: "GET",
    path: "/esims/{iccid}/usage",
    summary: "Live usage for an owned ICCID.",
  },
  {
    method: "POST",
    path: "/orders/{id}/cancel",
    summary: "Cancel unused order and credit Partner wallet.",
    request: `{ "reason": "OTHERS", "notes": "unused" }`,
  },
  {
    method: "GET",
    path: "/wallet",
    summary: "USD balance + recent ledger.",
  },
];

export default function PartnerApiDocsClient({
  toc,
  cancelReasonCodes,
}: {
  toc: TocItem[];
  cancelReasonCodes: string[];
}) {
  const [open, setOpen] = useState<string | null>(ENDPOINTS[0]?.path ?? null);

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <aside className="mb-6 lg:sticky lg:top-4 lg:mb-0 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          On this page
        </p>
        <ul className="mt-3 space-y-1">
          {toc.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="block rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-900 hover:text-emerald-300"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="/api/partner/docs/markdown"
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-emerald-400 px-3 text-sm font-semibold text-slate-950"
        >
          Download Markdown guide
        </a>
      </aside>

      <div className="min-w-0 space-y-10">
        <section id="overview" className="space-y-3">
          <h1 className="text-2xl font-bold text-slate-50">Partner API docs</h1>
          <p className="text-sm text-slate-400">
            Authenticate with{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
              Authorization: Bearer map_live_...
            </code>
            . Same-origin hint: use{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">
              /api/v1/partner/...
            </code>{" "}
            on this host with your Bearer token.
          </p>
        </section>

        <section id="wallet-credit" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Wallet credit</h2>
          <p className="text-sm text-slate-400">
            <code>POST /checkout/credit</code> atomically deducts Partner wallet
            USD and fulfills via the existing Partner purchase pipeline. Gateway
            remainder checkouts are not supported on the public API — keep a
            sufficient prepaid balance.
          </p>
        </section>

        <section id="base-url" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Base URL</h2>
          <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-emerald-300">
            {`/api/v1/partner`}
          </pre>
        </section>

        <section id="downloads" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Downloads</h2>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/partner/docs/markdown"
              className="inline-flex h-10 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-100 hover:border-emerald-500/40"
            >
              PARTNER_API.md
            </a>
            <a
              href="/api/partner/docs/postman-collection"
              className="inline-flex h-10 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-100 hover:border-emerald-500/40"
            >
              Postman collection
            </a>
            <a
              href="/api/partner/docs/postman-environment"
              className="inline-flex h-10 items-center rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-100 hover:border-emerald-500/40"
            >
              Postman environment
            </a>
          </div>
        </section>

        <section id="authentication" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Authentication</h2>
          <p className="text-sm text-slate-400">
            Mint keys under Account → API Keys. Tokens are shown once; MAP stores
            SHA-256 only. Disabled partners / disabled API access → 403. Global
            pause → 503.
          </p>
        </section>

        <section id="purchase-flow" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Purchase flow</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">
            <li>GET /offers or /offers/{"{offerId}"}</li>
            <li>POST /checkout/quote</li>
            <li>POST /checkout/credit with Idempotency-Key</li>
            <li>GET /orders/{"{id}"} for ICCID / LPA / QR</li>
            <li>Optional POST /orders/{"{id}"}/cancel when unused</li>
          </ol>
        </section>

        <section id="offer-fields" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Offer fields</h2>
          <p className="text-sm text-slate-400">
            Partner-safe fields only: offerId, name, dataLabel, validityLabel,
            destinationCode/Label, region, partnerPriceUsd/Cents/Label, currency.
            Never includes supplier names or provider cost.
          </p>
        </section>

        <section id="all-endpoints" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">All endpoints</h2>
          <div className="space-y-2">
            {ENDPOINTS.map((ep) => {
              const key = `${ep.method} ${ep.path}`;
              const isOpen = open === ep.path;
              return (
                <div
                  key={key}
                  className="rounded-xl border border-slate-800 bg-slate-900/50"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : ep.path)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-100">
                      <span className="mr-2 text-emerald-400">{ep.method}</span>
                      {ep.path}
                    </span>
                    <span className="text-xs text-slate-500">
                      {isOpen ? "Hide" : "Show"}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-3 border-t border-slate-800 px-4 py-3 text-sm text-slate-400">
                      <p>{ep.summary}</p>
                      {ep.request ? (
                        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                          {ep.request}
                        </pre>
                      ) : null}
                      {ep.response ? (
                        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                          {ep.response}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section id="cancel-reason-codes" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">
            Cancel reason codes
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Code</th>
                </tr>
              </thead>
              <tbody>
                {cancelReasonCodes.map((code) => (
                  <tr key={code} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs text-emerald-300">
                      {code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="errors-limits" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">Errors & limits</h2>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>
              <strong className="text-slate-200">400</strong> — validation,
              insufficient wallet credit, ineligible cancellation
            </li>
            <li>
              <strong className="text-slate-200">401</strong> — missing/invalid
              Bearer token
            </li>
            <li>
              <strong className="text-slate-200">403</strong> — partner disabled
              or API access not enabled (`API_ACCESS_DISABLED`)
            </li>
            <li>
              <strong className="text-slate-200">429</strong> — per-key rate
              limit
            </li>
            <li>
              <strong className="text-slate-200">503</strong> — global Partner
              Public API paused
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
