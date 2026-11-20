"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createPartnerApiKeyAction,
  revokePartnerApiKeyAction,
  type PartnerApiKeyCreateState,
  type PartnerApiKeyRevokeState,
} from "@/app/lib/partner/partnerApiKeyActions";
import type { PartnerApiKeyListRow } from "@/app/lib/partner/partnerApiKeys";

export default function PartnerApiKeysManager({
  apiEnabled,
  keys,
}: {
  apiEnabled: boolean;
  keys: PartnerApiKeyListRow[];
}) {
  const [createState, createAction, createPending] = useActionState(
    createPartnerApiKeyAction,
    null as PartnerApiKeyCreateState
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokePartnerApiKeyAction,
    null as PartnerApiKeyRevokeState
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (createState?.ok) setCopied(false);
  }, [createState]);

  if (!apiEnabled) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-5">
        <h2 className="text-lg font-semibold text-amber-100">API Keys Manager</h2>
        <p className="mt-2 text-sm text-slate-300">
          API access is currently disabled for your account — contact support to
          request access.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-50">API Keys Manager</h2>
        <p className="mt-1 text-sm text-slate-400">
          Keys are shown once at creation. MAP stores only a SHA-256 hash.
        </p>
      </div>

      <form action={createAction} className="flex flex-wrap gap-2">
        <input
          name="name"
          required
          maxLength={64}
          placeholder="Key name (e.g. Production)"
          className="h-10 min-w-[12rem] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        />
        <button
          type="submit"
          disabled={createPending}
          className="inline-flex h-10 items-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          {createPending ? "Creating…" : "Generate API key"}
        </button>
      </form>
      {createState && !createState.ok ? (
        <p className="text-sm text-red-300">{createState.error}</p>
      ) : null}
      {createState?.ok ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm font-semibold text-emerald-200">
            {createState.message}
          </p>
          <p className="mt-2 break-all font-mono text-xs text-slate-100">
            {createState.rawToken}
          </p>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-emerald-300 underline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(createState.rawToken);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy token"}
          </button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {keys.length === 0 ? (
          <li className="text-sm text-slate-400">No keys yet.</li>
        ) : (
          keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
            >
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-slate-100">
                  {key.name}{" "}
                  <span className="font-mono text-xs text-slate-400">
                    {key.prefix}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Created {key.createdAtLabel} · Last used {key.lastUsedAtLabel}
                  {key.revoked ? " · Revoked" : ""}
                </p>
              </div>
              {!key.revoked ? (
                <form action={revokeAction}>
                  <input type="hidden" name="keyId" value={key.id} />
                  <button
                    type="submit"
                    disabled={revokePending}
                    className="inline-flex h-8 items-center rounded-lg border border-red-500/40 px-2.5 text-xs font-semibold text-red-300 disabled:opacity-60"
                  >
                    Revoke
                  </button>
                </form>
              ) : null}
            </li>
          ))
        )}
      </ul>
      {revokeState && !revokeState.ok ? (
        <p className="text-sm text-red-300">{revokeState.error}</p>
      ) : null}
      {revokeState?.ok ? (
        <p className="text-sm text-emerald-300">{revokeState.message}</p>
      ) : null}
    </section>
  );
}
