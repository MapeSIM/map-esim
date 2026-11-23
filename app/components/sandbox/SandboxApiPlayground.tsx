"use client";

import { useMemo, useState } from "react";
import {
  generateSandboxTestKey,
  SANDBOX_CATALOG,
} from "@/app/lib/sandbox/sandboxShared";

type EndpointId =
  | "catalog"
  | "wallet"
  | "orders_list"
  | "orders_create"
  | "esim";

type EndpointDef = {
  id: EndpointId;
  label: string;
  method: "GET" | "POST";
  path: string;
  defaultBody?: string;
};

const ENDPOINTS: EndpointDef[] = [
  {
    id: "catalog",
    label: "GET catalog",
    method: "GET",
    path: "/api/sandbox/v1/catalog",
  },
  {
    id: "wallet",
    label: "GET wallet",
    method: "GET",
    path: "/api/sandbox/v1/wallet",
  },
  {
    id: "orders_list",
    label: "GET orders",
    method: "GET",
    path: "/api/sandbox/v1/orders",
  },
  {
    id: "orders_create",
    label: "POST orders",
    method: "POST",
    path: "/api/sandbox/v1/orders",
    defaultBody: JSON.stringify(
      { offerId: SANDBOX_CATALOG[0]?.id ?? "sandbox_eu_1gb_7d", quantity: 1 },
      null,
      2
    ),
  },
  {
    id: "esim",
    label: "GET esims/:iccid",
    method: "GET",
    path: "/api/sandbox/v1/esims/8944123456789000000",
  },
];

function statusBadgeClass(status: number | null): string {
  if (status == null) return "border-white/10 text-slate-400";
  if (status >= 200 && status < 300)
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  if (status >= 400 && status < 500)
    return "border-amber-500/40 bg-amber-500/15 text-amber-200";
  return "border-rose-500/40 bg-rose-500/15 text-rose-300";
}

export default function SandboxApiPlayground() {
  const [apiKey, setApiKey] = useState(() => generateSandboxTestKey());
  const [selectedId, setSelectedId] = useState<EndpointId>("catalog");
  const selected = useMemo(
    () => ENDPOINTS.find((e) => e.id === selectedId) ?? ENDPOINTS[0]!,
    [selectedId]
  );
  const [path, setPath] = useState(selected.path);
  const [body, setBody] = useState(selected.defaultBody ?? "");
  const [status, setStatus] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [output, setOutput] = useState<string>(
    "// Click Send Request to call /api/sandbox/v1/*"
  );
  const [busy, setBusy] = useState(false);

  function selectEndpoint(ep: EndpointDef) {
    setSelectedId(ep.id);
    setPath(ep.path);
    setBody(ep.defaultBody ?? "");
    setStatus(null);
    setLatencyMs(null);
  }

  async function sendRequest() {
    setBusy(true);
    const started = performance.now();
    try {
      const init: RequestInit = {
        method: selected.method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json",
        },
      };
      if (selected.method === "POST") {
        init.headers = {
          ...init.headers,
          "Content-Type": "application/json",
        };
        init.body = body || "{}";
      }
      const res = await fetch(path, init);
      const text = await res.text();
      const ms = Math.round(performance.now() - started);
      setStatus(res.status);
      setLatencyMs(ms);
      try {
        setOutput(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setOutput(text || "(empty body)");
      }
    } catch (err) {
      setStatus(0);
      setLatencyMs(Math.round(performance.now() - started));
      setOutput(
        JSON.stringify(
          {
            success: false,
            error: err instanceof Error ? err.message : "Request failed",
          },
          null,
          2
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400">
          API playground
        </p>
        <h1 className="text-2xl font-bold text-slate-50 sm:text-3xl">
          Interactive sandbox engine
        </h1>
        <p className="max-w-xl text-sm text-slate-400">
          Live requests to{" "}
          <code className="text-emerald-300">/api/sandbox/v1/*</code> with a
          generated <code className="text-emerald-300">sb_test_…</code> key.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <label className="min-w-[16rem] flex-1 space-y-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            Test API key
          </span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.1] bg-slate-950 px-3 font-mono text-xs text-slate-100 outline-none focus:border-emerald-500/50"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          onClick={() => setApiKey(generateSandboxTestKey())}
          className="inline-flex h-11 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.05]"
        >
          Generate key
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <ul className="space-y-1">
          {ENDPOINTS.map((ep) => (
            <li key={ep.id}>
              <button
                type="button"
                onClick={() => selectEndpoint(ep)}
                className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  selectedId === ep.id
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                }`}
              >
                {ep.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
              {selected.method}
            </span>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-slate-950 px-3 font-mono text-xs text-slate-100 outline-none focus:border-emerald-500/50"
              spellCheck={false}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void sendRequest()}
              className="inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send Request"}
            </button>
          </div>

          {selected.method === "POST" ? (
            <label className="block space-y-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                JSON body
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-white/[0.1] bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-emerald-500/50"
                spellCheck={false}
              />
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}
            >
              {status == null ? "No response" : `HTTP ${status}`}
            </span>
            {latencyMs != null ? (
              <span className="text-xs font-medium text-slate-500">
                {latencyMs} ms
              </span>
            ) : null}
          </div>

          <pre className="min-h-[16rem] overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
            {output}
          </pre>
        </div>
      </div>
    </div>
  );
}
