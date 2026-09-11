"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  saveReferralProgramConfigAction,
  type ReferralProgramFormState,
} from "@/app/lib/admin/referralProgramActions";
import type { AdminReferralProgramView } from "@/app/lib/referrals/referralProgramConfig";

function FormMessage({ state }: { state: ReferralProgramFormState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        className="mt-2 text-sm font-medium text-[var(--accent-strong)]"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  return (
    <p
      className="mt-2 text-sm font-medium text-red-700 dark:text-red-300"
      role="alert"
    >
      {state.error}
    </p>
  );
}

export function ReferralProgramSettingsPanel({
  initial,
}: {
  initial: AdminReferralProgramView;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(
    saveReferralProgramConfigAction,
    null
  );
  const [enabled, setEnabled] = useState(initial.enabled);
  const [rewardType, setRewardType] = useState(initial.rewardType);
  const [rewardValue, setRewardValue] = useState(initial.rewardValueDisplay);
  const [minPurchase, setMinPurchase] = useState(initial.minPurchaseDisplay);
  const [maxReward, setMaxReward] = useState(initial.maxRewardDisplay);
  const [version, setVersion] = useState(initial.version);
  const [updatedAtLabel, setUpdatedAtLabel] = useState(initial.updatedAtLabel);
  const [rewardCopy, setRewardCopy] = useState(initial.rewardCopy);

  useEffect(() => {
    if (state?.ok) {
      setEnabled(state.view.enabled);
      setRewardType(state.view.rewardType);
      setRewardValue(state.view.rewardValueDisplay);
      setMinPurchase(state.view.minPurchaseDisplay);
      setMaxReward(state.view.maxRewardDisplay);
      setVersion(state.view.version);
      setUpdatedAtLabel(state.view.updatedAtLabel);
      setRewardCopy(state.view.rewardCopy);
    }
  }, [state]);

  const statusLabel = enabled ? "Enabled" : "Disabled";

  return (
    <section
      className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5"
      aria-labelledby={`${formId}-heading`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${formId}-heading`}
            className="text-base font-semibold tracking-tight text-[var(--heading)]"
          >
            Customer referral program
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
            Control referrer wallet rewards after a referred customer completes
            their first eSIM purchase. Tracking stays active; rewards follow
            these settings.
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
            enabled
              ? "bg-[var(--accent-strong)]/12 text-[var(--accent-strong)]"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--heading)]"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <dl className="grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-2">
        <div>
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Customer preview
          </dt>
          <dd className="mt-0.5 text-[var(--heading)]">{rewardCopy}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-[0.06em] text-[var(--text-soft)]">
            Last updated
          </dt>
          <dd className="mt-0.5 text-[var(--heading)]">{updatedAtLabel}</dd>
        </div>
      </dl>

      <form action={action} className="space-y-4">
        <input type="hidden" name="expectedVersion" value={version} />
        <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />

        <label className="flex items-center gap-2 text-sm text-[var(--heading)]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)]"
          />
          Enable referral rewards
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-semibold text-[var(--heading)]">
              Reward type
            </span>
            <select
              name="rewardType"
              value={rewardType}
              onChange={(e) =>
                setRewardType(
                  e.target.value === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT"
                )
              }
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-[var(--heading)]"
            >
              <option value="FIXED_AMOUNT">Fixed amount (USD)</option>
              <option value="PERCENTAGE">Percentage of purchase</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-semibold text-[var(--heading)]">
              {rewardType === "PERCENTAGE"
                ? "Reward percentage"
                : "Reward amount (USD)"}
            </span>
            <input
              name="rewardValue"
              value={rewardValue}
              onChange={(e) => setRewardValue(e.target.value)}
              inputMode="decimal"
              placeholder={rewardType === "PERCENTAGE" ? "5" : "5.00"}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-[var(--heading)]"
              required
            />
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              {rewardType === "PERCENTAGE"
                ? "Example: 5 = 5% of first purchase price."
                : "Example: 5.00 = $5.00 wallet credit."}
            </span>
          </label>

          <label className="block text-sm">
            <span className="font-semibold text-[var(--heading)]">
              Minimum qualifying purchase (USD)
            </span>
            <input
              name="minPurchase"
              value={minPurchase}
              onChange={(e) => setMinPurchase(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-[var(--heading)]"
            />
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              Leave 0.00 for no minimum.
            </span>
          </label>

          <label className="block text-sm">
            <span className="font-semibold text-[var(--heading)]">
              Max reward cap (USD, percentage only)
            </span>
            <input
              name="maxReward"
              value={maxReward}
              onChange={(e) => setMaxReward(e.target.value)}
              inputMode="decimal"
              placeholder="Optional"
              disabled={rewardType !== "PERCENTAGE"}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2 text-[var(--heading)] disabled:opacity-50"
            />
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              Optional cap for percentage rewards. Ignored for fixed amount.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save referral settings"}
          </button>
          <FormMessage state={state} />
        </div>
      </form>
    </section>
  );
}
