"use client";

import { useActionState } from "react";
import {
  adminRevokePartnerApiKeyFormAction,
  setPartnerApiEnabledAction,
  type PartnerApiAccessActionState,
} from "@/app/lib/partner/partnerApiAccessAdminActions";
import type { PartnerApiKeyListRow } from "@/app/lib/partner/partnerApiKeys";

export default function AdminPartnerApiAccessCard({
  partnerId,
  apiEnabled,
  globalPaused,
  keys,
}: {
  partnerId: string;
  apiEnabled: boolean;
  globalPaused: boolean;
  keys: PartnerApiKeyListRow[];
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    setPartnerApiEnabledAction,
    null as PartnerApiAccessActionState
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    adminRevokePartnerApiKeyFormAction,
    null as PartnerApiAccessActionState
  );

  return (
    <section
      className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
      aria-label="API Access"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--heading)]">
            API Access
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Controls Bearer access to{" "}
            <code className="text-xs">/api/v1/partner/*</code>. Default is off
            until explicitly enabled.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            apiEnabled
              ? "border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 text-[var(--heading)]"
              : "border-[var(--border)] text-[var(--text-muted)]"
          }`}
        >
          {apiEnabled ? "API Enabled" : "API Disabled"}
        </span>
      </div>

      {globalPaused ? (
        <p
          className="mt-3 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-sm text-[var(--warning-text)]"
          role="status"
        >
          Global Partner Public API is paused (Operations control / env). All
          partners receive 503 until resumed.
        </p>
      ) : null}

      <form action={toggleAction} className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="partnerId" value={partnerId} />
        <input
          type="hidden"
          name="enabled"
          value={apiEnabled ? "false" : "true"}
        />
        <button
          type="submit"
          disabled={togglePending}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {togglePending
            ? "Saving…"
            : apiEnabled
              ? "Disable API access"
              : "Enable API access"}
        </button>
        {toggleState && !toggleState.ok ? (
          <p className="text-sm text-[var(--danger-text)]">{toggleState.error}</p>
        ) : null}
        {toggleState?.ok ? (
          <p className="text-sm text-[var(--heading)]">{toggleState.message}</p>
        ) : null}
      </form>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-[var(--heading)]">API keys</h3>
        {keys.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            No API keys created yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-[var(--heading)]">
                    {key.name}{" "}
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {key.prefix}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--text-soft)]">
                    Created {key.createdAtLabel} · Last used {key.lastUsedAtLabel}
                    {key.revoked ? " · Revoked" : ""}
                  </p>
                </div>
                {!key.revoked ? (
                  <form action={revokeAction}>
                    <input type="hidden" name="partnerId" value={partnerId} />
                    <input type="hidden" name="keyId" value={key.id} />
                    <button
                      type="submit"
                      disabled={revokePending}
                      className="inline-flex h-8 items-center rounded-lg border border-[var(--danger-border)] px-2.5 text-xs font-semibold text-[var(--danger-text)] disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {revokeState && !revokeState.ok ? (
          <p className="mt-2 text-sm text-[var(--danger-text)]">
            {revokeState.error}
          </p>
        ) : null}
        {revokeState?.ok ? (
          <p className="mt-2 text-sm text-[var(--heading)]">
            {revokeState.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
