"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  PARTNER_SITE_ORIGIN,
  SANDBOX_SITE_ORIGIN,
} from "@/app/lib/domain/appDomain";

type TocItem = { id: string; label: string };
type EnvMode = "sandbox" | "production";

function CopyCode({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-white/[0.1] px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/[0.04]"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          {title}
        </p>
        <CopyCode text={text} />
      </div>
      <pre className="overflow-x-auto rounded-lg bg-[#070D19] p-3 text-xs text-slate-300">
        {text}
      </pre>
    </div>
  );
}

type EndpointDoc = {
  method: string;
  path: string;
  summary: string;
  body?: string;
  okJson: string;
};

function buildEndpoints(baseUrl: string, apiKey: string): EndpointDoc[] {
  return [
    {
      method: "GET",
      path: "/me",
      summary:
        "Verify the API key, partner name, environment (sandbox|production), and wallet balance. Alias: GET /account.",
      okJson: `{
  "success": true,
  "environment": "sandbox|production",
  "partner": { "id": "...", "name": "Acme Travel", "email": "ops@acme.test" },
  "wallet": { "balanceCents": 125000, "balanceUsd": 1250, "balanceLabel": "$1,250.00 USD", "currency": "USD" }
}`,
    },
    {
      method: "GET",
      path: "/wallet",
      summary: "Current USD balance and recent ledger summary (?limit=1..50).",
      okJson: `{
  "success": true,
  "wallet": {
    "balanceCents": 125000,
    "balanceUsd": 1250,
    "balanceLabel": "$1,250.00 USD",
    "currency": "USD",
    "transactions": [{ "id": "...", "type": "ESIM_PURCHASE_DEBIT", "amountCents": -450, "createdAt": "..." }]
  }
}`,
    },
    {
      method: "GET",
      path: "/catalog",
      summary:
        "List available eSIM packages (country/region, data, validity, partner price). Includes read-only supportTopUp / supportTopUpType capability flags. Also returns offers[]. Alias: GET /offers.",
      okJson: `{
  "success": true,
  "catalog": [{
    "offerId": "sandbox_eu_1gb_7d",
    "name": "1 GB · 7 days",
    "destinationCode": "EU",
    "destinationLabel": "Europe",
    "region": "Europe",
    "kind": "regional",
    "dataLabel": "1 GB",
    "validityLabel": "7 days",
    "partnerPriceCents": 450,
    "partnerPriceUsd": 4.5,
    "partnerPriceLabel": "$4.50",
    "retailPriceCents": 450,
    "retailPriceUsd": 4.5,
    "retailPriceLabel": "$4.50",
    "currency": "USD",
    "supportTopUp": true,
    "supportTopUpType": "recharge"
  }],
  "offers": [],
  "page": 1, "limit": 50, "total": 1
}`,
    },
    {
      method: "POST",
      path: "/orders",
      summary:
        "Create an eSIM order. Production provisions via VeSIM; sandbox returns simulated Luhn ICCID + LPA/QR. Send Idempotency-Key on production. Add More Data / rechargeOrderId is portal-only (not supported on this endpoint).",
      body: `{ "offerId": "YOUR_OFFER_ID", "quantity": 1 }`,
      okJson: `{
  "success": true,
  "order": {
    "orderId": "...",
    "status": "COMPLETED",
    "iccid": "8944...",
    "lpa": "LPA:1$smdp...$...",
    "qrUrl": "...",
    "qrCodeUrl": "...",
    "shareUrl": "..."
  }
}`,
    },
    {
      method: "GET",
      path: "/orders",
      summary: "List orders (?page=&limit=).",
      okJson: `{
  "success": true,
  "orders": [{ "orderId": "...", "status": "COMPLETED", "iccid": "8944...", "lpa": "LPA:1$...", "shareUrl": "..." }],
  "page": 1, "limit": 25, "total": 1
}`,
    },
    {
      method: "GET",
      path: "/orders/{orderId}",
      summary:
        "Full order detail including iccid, lpa, qrCodeUrl, shareUrl, and status.",
      okJson: `{
  "success": true,
  "order": {
    "orderId": "...",
    "status": "COMPLETED",
    "iccid": "8944...",
    "lpa": "LPA:1$...",
    "qrUrl": "...",
    "qrCodeUrl": "...",
    "shareUrl": "..."
  }
}`,
    },
    {
      method: "GET",
      path: "/orders/{orderId}/usage",
      summary:
        "eSIM status / remaining data by order id. Production = live usage; sandbox = simulated GB. For ICCID lookup see Environment-specific routes (paths differ by environment).",
      okJson: `{
  "success": true,
  "orderId": "...",
  "iccid": "8944...",
  "usage": {
    "status": "ACTIVE",
    "initialDataGB": 1,
    "remainingDataGB": 0.72,
    "usedDataGB": 0.28,
    "usagePercent": 28,
    "daysRemaining": 22,
    "isActivated": true,
    "isExpired": false
  }
}`,
    },
  ].map((ep) => ({
    ...ep,
    // Keep path relative; snippets inject baseUrl/apiKey below.
    summary: ep.summary.replace("BASE", baseUrl).replace("KEY", apiKey),
  }));
}

function curlSnippet(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: string
): string {
  const url = `${baseUrl}${path.replace("{orderId}", "ORDER_ID").replace("{iccid}", "ICCID")}`;
  if (method === "GET") {
    return `curl -sS "${url}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "x-api-key: ${apiKey}"`;
  }
  return `curl -sS -X ${method} "${url}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "x-api-key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '${body ?? "{}"}'`;
}

function nodeSnippet(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: string
): string {
  const url = `${baseUrl}${path.replace("{orderId}", "ORDER_ID").replace("{iccid}", "ICCID")}`;
  if (method === "GET") {
    return `const res = await fetch("${url}", {
  headers: {
    Authorization: "Bearer ${apiKey}",
    "x-api-key": "${apiKey}",
  },
});
const data = await res.json();
console.log(res.status, data);`;
  }
  return `const res = await fetch("${url}", {
  method: "${method}",
  headers: {
    Authorization: "Bearer ${apiKey}",
    "x-api-key": "${apiKey}",
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify(${body ?? "{}"}),
});
const data = await res.json();
console.log(res.status, data);`;
}

function phpSnippet(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: string
): string {
  const url = `${baseUrl}${path.replace("{orderId}", "ORDER_ID").replace("{iccid}", "ICCID")}`;
  if (method === "GET") {
    return `$ch = curl_init("${url}");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer ${apiKey}",
    "x-api-key: ${apiKey}",
  ],
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo $status, PHP_EOL, $response;`;
  }
  return `$payload = '${body ?? "{}"}';
$ch = curl_init("${url}");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST => "${method}",
  CURLOPT_POSTFIELDS => $payload,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer ${apiKey}",
    "x-api-key: ${apiKey}",
    "Content-Type: application/json",
    "Idempotency-Key: " . bin2hex(random_bytes(16)),
  ],
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo $status, PHP_EOL, $response;`;
}

export default function PartnerApiDocsClient({
  toc,
  cancelReasonCodes,
  defaultEnvironment = "production",
}: {
  toc: TocItem[];
  cancelReasonCodes: string[];
  /** sandbox docs default to sandbox; partner docs default to production. */
  defaultEnvironment?: EnvMode;
}) {
  const [env, setEnv] = useState<EnvMode>(defaultEnvironment);
  const [open, setOpen] = useState<string | null>("/me");

  const baseUrl =
    env === "sandbox"
      ? `${SANDBOX_SITE_ORIGIN}/api/sandbox/v1`
      : `${PARTNER_SITE_ORIGIN}/api/v1`;
  const apiKey = env === "sandbox" ? "sb_test_YOUR_KEY" : "map_live_YOUR_KEY";
  const endpoints = useMemo(
    () => buildEndpoints(baseUrl, apiKey),
    [baseUrl, apiKey]
  );

  const envFile =
    env === "sandbox"
      ? `MAP_ESIM_API_BASE=${SANDBOX_SITE_ORIGIN}/api/sandbox/v1
MAP_ESIM_API_KEY=sb_test_YOUR_KEY
MAP_ESIM_ENV=sandbox`
      : `MAP_ESIM_API_BASE=${PARTNER_SITE_ORIGIN}/api/v1
MAP_ESIM_API_KEY=map_live_YOUR_KEY
MAP_ESIM_ENV=production`;

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <aside className="mb-6 rounded-2xl border border-white/[0.08] bg-[#0D1526] p-4 lg:sticky lg:top-20 lg:mb-0 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          On this page
        </p>
        <ul className="mt-3 space-y-1">
          {toc.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="block rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/[0.04] hover:text-emerald-300"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        {env === "production" ? (
          <a
            href="/api/partner/docs/markdown"
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Download Markdown guide
          </a>
        ) : null}
      </aside>

      <div className="min-w-0 space-y-10">
        <section id="overview" className="space-y-3">
          <h1 className="text-2xl font-bold text-slate-50">Partner API docs</h1>
          <p className="text-sm text-slate-400">
            One contract for Sandbox and Production. Authenticate with{" "}
            <code className="rounded bg-[#070D19] px-1.5 py-0.5 text-emerald-300">
              Authorization: Bearer &lt;KEY&gt;
            </code>{" "}
            or{" "}
            <code className="rounded bg-[#070D19] px-1.5 py-0.5 text-emerald-300">
              x-api-key: &lt;KEY&gt;
            </code>
            .
          </p>
        </section>

        <section id="quick-start" className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">
            Quick Start & Environment Switcher
          </h2>
          <div className="inline-flex rounded-xl border border-white/[0.1] p-1">
            <button
              type="button"
              onClick={() => setEnv("sandbox")}
              className={
                env === "sandbox"
                  ? "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950"
                  : "rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-300"
              }
            >
              Sandbox
            </button>
            <button
              type="button"
              onClick={() => setEnv("production")}
              className={
                env === "production"
                  ? "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950"
                  : "rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-300"
              }
            >
              Production
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#070D19] text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Sandbox</th>
                  <th className="px-4 py-3">Production</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-slate-300">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-100">Base URL</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {SANDBOX_SITE_ORIGIN}/api/sandbox/v1
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {PARTNER_SITE_ORIGIN}/api/v1
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-100">API key</td>
                  <td className="px-4 py-3 font-mono text-xs">sb_test_…</td>
                  <td className="px-4 py-3 font-mono text-xs">map_live_…</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-100">Orders</td>
                  <td className="px-4 py-3">Simulated ICCID / LPA / QR</td>
                  <td className="px-4 py-3">Live VeSIM provisioning</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-100">Usage</td>
                  <td className="px-4 py-3">Simulated remaining GB</td>
                  <td className="px-4 py-3">Live usage from provider</td>
                </tr>
              </tbody>
            </table>
          </div>

          <CodeBlock title=".env example (active environment)" text={envFile} />
          <p className="text-sm text-slate-400">
            Active base:{" "}
            <code className="rounded bg-[#070D19] px-1.5 py-0.5 text-emerald-300">
              {baseUrl}
            </code>
            . Legacy production paths under{" "}
            <code className="text-slate-300">/api/v1/partner/*</code> remain
            supported.
          </p>
        </section>

        <section id="authentication" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Authentication</h2>
          <p className="text-sm text-slate-400">
            Sandbox keys live under Account → API Keys (persistent; rotate
            explicitly). Production keys live under Partner Account → API Keys.
            Tokens are shown once; MAP stores SHA-256 only.
          </p>
        </section>

        <section id="all-endpoints" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">All endpoints</h2>
          <div className="space-y-2">
            {endpoints.map((ep) => {
              const key = `${ep.method} ${ep.path}`;
              const isOpen = open === ep.path;
              return (
                <div
                  key={key}
                  className="rounded-xl border border-white/[0.08] bg-[#0D1526]"
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
                    <div className="space-y-3 border-t border-white/[0.06] px-4 py-3 text-sm text-slate-400">
                      <p>{ep.summary}</p>
                      <CodeBlock
                        title="cURL"
                        text={curlSnippet(
                          baseUrl,
                          apiKey,
                          ep.method,
                          ep.path,
                          ep.body
                        )}
                      />
                      <CodeBlock
                        title="Node.js (fetch)"
                        text={nodeSnippet(
                          baseUrl,
                          apiKey,
                          ep.method,
                          ep.path,
                          ep.body
                        )}
                      />
                      <CodeBlock
                        title="PHP"
                        text={phpSnippet(
                          baseUrl,
                          apiKey,
                          ep.method,
                          ep.path,
                          ep.body
                        )}
                      />
                      <CodeBlock title="200 OK JSON" text={ep.okJson} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section id="environment-routes" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">
            Environment-specific routes
          </h2>
          <p className="text-sm text-slate-400">
            Canonical paths above work on both bases. These routes exist only in
            one environment — do not call them on the other.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#070D19] text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Where</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-slate-300">
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    GET /orders/{"{orderId}"}/usage
                  </td>
                  <td className="px-4 py-3">Both</td>
                  <td className="px-4 py-3">
                    Preferred usage lookup by order id
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    GET /esims/{"{iccid}"}/usage
                  </td>
                  <td className="px-4 py-3">Sandbox</td>
                  <td className="px-4 py-3">
                    Full path:{" "}
                    <code className="text-slate-200">
                      /api/sandbox/v1/esims/{"{iccid}"}/usage
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    GET /partner/esims/{"{iccid}"}/usage
                  </td>
                  <td className="px-4 py-3">Production</td>
                  <td className="px-4 py-3">
                    Full path:{" "}
                    <code className="text-slate-200">
                      /api/v1/partner/esims/{"{iccid}"}/usage
                    </code>
                    . No{" "}
                    <code className="text-slate-200">/api/v1/esims/…</code>{" "}
                    alias.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    GET /partner/destinations
                  </td>
                  <td className="px-4 py-3">Production</td>
                  <td className="px-4 py-3">Legacy destination list</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    POST /partner/checkout/quote
                  </td>
                  <td className="px-4 py-3">Production</td>
                  <td className="px-4 py-3">Legacy wallet quote</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    POST /partner/checkout/credit
                  </td>
                  <td className="px-4 py-3">Production</td>
                  <td className="px-4 py-3">
                    Legacy purchase (prefer POST /orders)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    POST /partner/orders/{"{id}"}/cancel
                  </td>
                  <td className="px-4 py-3">Production</td>
                  <td className="px-4 py-3">
                    Refund request ticket (no instant wallet credit)
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">
                    POST /wallet
                  </td>
                  <td className="px-4 py-3">Sandbox</td>
                  <td className="px-4 py-3">
                    Demo wallet balance top-up only — not eSIM data recharge
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-400">
            <span className="font-semibold text-slate-200">Add More Data:</span>{" "}
            catalog{" "}
            <code className="text-emerald-300">supportTopUp</code> /{" "}
            <code className="text-emerald-300">supportTopUpType</code> are
            read-only capability signals. Recharge /{" "}
            <code className="text-slate-300">rechargeOrderId</code> checkout is{" "}
            <span className="font-semibold text-slate-200">
              portal-only
            </span>{" "}
            today (
            <code className="text-slate-300">
              /partner/orders/{"{orderId}"}/add-data
            </code>
            ). There is no public Partner API top-up endpoint yet.
          </p>
        </section>

        <section id="errors" className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">
            Error codes
          </h2>
          <p className="text-sm text-slate-400">
            Error body shape:{" "}
            <code className="text-emerald-300">
              {"{ \"success\": false, \"error\": \"...\", \"message\": \"...\" }"}
            </code>
            . Sandbox responses also include{" "}
            <code className="text-slate-300">sandbox: true</code>.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#070D19] text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-slate-300">
                <tr>
                  <td className="px-4 py-3 font-mono">400</td>
                  <td className="px-4 py-3">
                    Validation / bad JSON / invalid query or body
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono">401</td>
                  <td className="px-4 py-3">
                    Missing/invalid Bearer or x-api-key
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono">402</td>
                  <td className="px-4 py-3">
                    Insufficient wallet balance for the purchase
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono">404</td>
                  <td className="px-4 py-3">
                    Order / offer / eSIM not found for this partner
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono">429</td>
                  <td className="px-4 py-3">Rate limited (production)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono">503</td>
                  <td className="px-4 py-3">
                    Temporary outage / global API pause (production)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {cancelReasonCodes.length > 0 ? (
            <p className="text-xs text-slate-500">
              Cancel reason codes (production{" "}
              <code>POST /api/v1/partner/orders/{"{id}"}/cancel</code>):{" "}
              {cancelReasonCodes.slice(0, 8).join(", ")}
              {cancelReasonCodes.length > 8 ? ", …" : ""}.
            </p>
          ) : null}
        </section>

        <section id="go-live" className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100">
            Go-Live Checklist
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-400">
            <li>
              Build against Sandbox base{" "}
              <code className="text-emerald-300">
                {SANDBOX_SITE_ORIGIN}/api/sandbox/v1
              </code>{" "}
              with an <code className="text-slate-300">sb_test_</code> key from
              Account → API Keys.
            </li>
            <li>
              Exercise <code>GET /me</code>, <code>GET /catalog</code>,{" "}
              <code>POST /orders</code>, <code>GET /orders/{"{id}"}</code>, and{" "}
              <code>GET /orders/{"{id}"}/usage</code> until response keys match
              your UI.
            </li>
            <li>
              Ask MAP admin to enable Partner Public API on your live account and
              mint a <code className="text-slate-300">map_live_</code> key.
            </li>
            <li>
              Change only env vars — keep the same relative paths:
              <pre className="mt-2 overflow-x-auto rounded-lg bg-[#070D19] p-3 text-xs text-slate-300">{`MAP_ESIM_API_BASE=${PARTNER_SITE_ORIGIN}/api/v1
MAP_ESIM_API_KEY=map_live_...
MAP_ESIM_ENV=production`}</pre>
            </li>
            <li>
              Production charges the Partner wallet and provisions real eSIMs —
              never point sandbox keys at production, and never reuse live keys
              on mapesim.store.
            </li>
          </ol>
        </section>

        {env === "production" ? (
          <section id="downloads" className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">Downloads</h2>
            <div className="flex flex-wrap gap-2">
              <a
                href="/api/partner/docs/markdown"
                className="inline-flex h-10 items-center rounded-xl border border-white/[0.1] px-3 text-sm font-semibold text-slate-100 hover:border-emerald-500/40"
              >
                PARTNER_API.md
              </a>
              <a
                href="/api/partner/docs/postman-collection"
                className="inline-flex h-10 items-center rounded-xl border border-white/[0.1] px-3 text-sm font-semibold text-slate-100 hover:border-emerald-500/40"
              >
                Postman collection
              </a>
              <a
                href="/api/partner/docs/postman-environment"
                className="inline-flex h-10 items-center rounded-xl border border-white/[0.1] px-3 text-sm font-semibold text-slate-100 hover:border-emerald-500/40"
              >
                Postman environment
              </a>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
