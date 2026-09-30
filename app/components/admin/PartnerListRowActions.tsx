"use client";

import { useActionState, useId } from "react";
import {
  disablePartnerAction,
  reactivatePartnerAction,
} from "@/app/lib/partner/partnersActions";
import type { PartnersFormState } from "@/app/lib/partner/partnersFormState";
import {
  AdminButton,
  adminButtonClassName,
} from "@/app/components/admin/ui";

type PartnerListStatus = "Active" | "Invited" | "Disabled" | "Deleted";

function FormMessage({ state }: { state: PartnersFormState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        className="mt-2 text-xs font-medium text-[var(--accent-strong)]"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  return (
    <p
      className="mt-2 text-xs font-medium text-red-700 dark:text-red-300"
      role="alert"
    >
      {state.error}
    </p>
  );
}

function StatusQuickForm({
  partnerId,
  statusVersion,
  mode,
}: {
  partnerId: string;
  statusVersion: number;
  mode: "disable" | "enable";
}) {
  const formId = useId();
  const action =
    mode === "disable" ? disablePartnerAction : reactivatePartnerAction;
  const [state, formAction, pending] = useActionState(action, null);
  const title = mode === "disable" ? "Disable Partner" : "Enable Partner";
  const reasonLabel =
    mode === "disable" ? "Disable reason" : "Enable note";
  const confirmLabel =
    mode === "disable" ? "Confirm disable" : "Confirm enable";

  return (
    <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-[var(--heading)] marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <form action={formAction} className="space-y-2 border-t border-[var(--border)] px-3 py-3">
        <input type="hidden" name="partnerId" value={partnerId} />
        <input
          type="hidden"
          name="expectedVersion"
          value={String(statusVersion)}
        />
        <label className="block text-xs" htmlFor={`${formId}-reason`}>
          <span className="mb-1 block font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            {reasonLabel} (required)
          </span>
          <textarea
            id={`${formId}-reason`}
            name="reason"
            required
            minLength={8}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            placeholder="8–500 characters"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={adminButtonClassName(
            mode === "disable" ? "danger" : "secondary",
            "sm",
            "w-full"
          )}
        >
          {pending ? "Saving…" : confirmLabel}
        </button>
        <FormMessage state={state} />
      </form>
    </details>
  );
}

export function PartnerListRowActions({
  partnerId,
  statusLabel,
  statusVersion,
}: {
  partnerId: string;
  statusLabel: PartnerListStatus;
  statusVersion: number;
}) {
  const menuId = useId();
  const detailHref = `/admin/partners/${encodeURIComponent(partnerId)}`;
  const canDisable =
    statusLabel === "Active" || statusLabel === "Invited";
  const canEnable = statusLabel === "Disabled";
  const canEditName = statusLabel !== "Deleted";

  return (
    <details className="relative group/actions">
      <summary
        className={`${adminButtonClassName("secondary", "sm")} cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden`}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        Actions
      </summary>
      <div
        id={menuId}
        role="menu"
        className="absolute right-0 z-30 mt-1 w-[17.5rem] space-y-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-2 shadow-lg"
      >
        <AdminButton
          href={detailHref}
          variant="primary"
          size="sm"
          className="w-full"
        >
          View Partner
        </AdminButton>
        {canEditName ? (
          <AdminButton
            href={`${detailHref}#partner-name`}
            variant="ghost"
            size="sm"
            className="w-full"
          >
            Edit name
          </AdminButton>
        ) : null}
        {canDisable ? (
          <StatusQuickForm
            partnerId={partnerId}
            statusVersion={statusVersion}
            mode="disable"
          />
        ) : null}
        {canEnable ? (
          <StatusQuickForm
            partnerId={partnerId}
            statusVersion={statusVersion}
            mode="enable"
          />
        ) : null}
        {!canDisable && !canEnable && !canEditName ? (
          <p className="px-2 py-1 text-xs text-[var(--text-muted)]">
            No status actions for deleted partners.
          </p>
        ) : null}
      </div>
    </details>
  );
}
