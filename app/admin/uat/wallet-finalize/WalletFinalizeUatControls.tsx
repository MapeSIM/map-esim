"use client";

import { useActionState } from "react";
import {
  cleanupPreviewWalletFinalizeUatAction,
  runPreviewWalletFinalizeUatAction,
  type WalletFinalizeUatActionState,
} from "./actions";

const initial: WalletFinalizeUatActionState = { ok: false };

function ResultPanel({ state }: { state: WalletFinalizeUatActionState }) {
  if (!state.error && !state.result && !state.cleanup) return null;
  return (
    <pre className="mt-4 overflow-auto rounded border border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-900">
      {JSON.stringify(state, null, 2)}
    </pre>
  );
}

export function WalletFinalizeUatControls() {
  const [runState, runAction, runPending] = useActionState(
    runPreviewWalletFinalizeUatAction,
    initial
  );
  const [cleanupState, cleanupAction, cleanupPending] = useActionState(
    cleanupPreviewWalletFinalizeUatAction,
    initial
  );

  return (
    <div className="space-y-8">
      <form action={runAction} className="space-y-3 rounded border p-4">
        <h2 className="text-sm font-semibold">Run scenario</h2>
        <label className="block text-sm">
          Scenario
          <select
            name="scenario"
            className="mt-1 block w-full rounded border px-2 py-1"
            defaultValue="happy"
          >
            <option value="happy">happy (provider-success → finalize)</option>
            <option value="replay">replay (idempotent finalize)</option>
            <option value="post_commit_promo_failure">
              post_commit_promo_failure
            </option>
            <option value="critical_failure">
              critical_failure (recon + durable observation)
            </option>
          </select>
        </label>
        <label className="block text-sm">
          Existing purchase id (replay only)
          <input
            name="existingPurchaseId"
            className="mt-1 block w-full rounded border px-2 py-1 font-mono text-xs"
            placeholder="from happy-path result.purchaseId"
          />
        </label>
        <button
          type="submit"
          disabled={runPending}
          className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {runPending ? "Running…" : "Run UAT scenario"}
        </button>
        <ResultPanel state={runState} />
      </form>

      <form action={cleanupAction} className="space-y-3 rounded border border-amber-300 p-4">
        <h2 className="text-sm font-semibold text-amber-900">
          Cleanup TEST fixtures only
        </h2>
        <p className="text-xs text-amber-800">
          Deletes only rows labelled TEST-WLF / uat-wlf.invalid from this harness.
        </p>
        <button
          type="submit"
          disabled={cleanupPending}
          className="rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {cleanupPending ? "Cleaning…" : "Cleanup TEST fixtures"}
        </button>
        <ResultPanel state={cleanupState} />
      </form>
    </div>
  );
}
