"use client";

import { useActionState } from "react";
import {
  retryEmailCenterSendAction,
  type EmailCenterRetryFormState,
} from "@/app/lib/admin/emailCenterActions";

const initialState: EmailCenterRetryFormState = null;

export default function EmailCenterRetryButton(props: {
  retryKind: string;
  targetId: string;
  emailEvent?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    retryEmailCenterSendAction,
    initialState
  );

  return (
    <div className="space-y-1">
      <form action={formAction}>
        <input type="hidden" name="retryKind" value={props.retryKind} />
        <input type="hidden" name="targetId" value={props.targetId} />
        {props.emailEvent ? (
          <input type="hidden" name="emailEvent" value={props.emailEvent} />
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
        >
          {pending ? "Retrying…" : "Retry Send"}
        </button>
      </form>
      {state?.ok ? (
        <p className="text-xs font-medium text-[var(--accent-strong)]" role="status">
          {state.message}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p className="text-xs font-medium text-[var(--danger-text)]" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
