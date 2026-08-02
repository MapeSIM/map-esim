"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AuthActionState } from "@/app/lib/auth/actions";
import PasswordConfirmStatus from "@/app/components/auth/PasswordConfirmStatus";
import PasswordField from "@/app/components/auth/PasswordField";
import PasswordRequirements from "@/app/components/auth/PasswordRequirements";

const initialState: AuthActionState = { ok: false };

export type AuthField = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  /** Show live password checklist under this field. */
  showRequirements?: boolean;
  /** Name of the password field this confirm field should match. */
  matchWith?: string;
  /** Watch this email field for “must not equal email” rule. */
  emailFieldName?: string;
};

export function AuthForm({
  action,
  fields,
  submitLabel,
  extras,
  footer,
  hiddenFields,
  successMessage,
  emailHint,
}: {
  action: (
    prev: AuthActionState,
    formData: FormData
  ) => Promise<AuthActionState>;
  fields: AuthField[];
  submitLabel: string;
  extras?: ReactNode;
  footer?: ReactNode;
  hiddenFields?: Record<string, string>;
  successMessage?: string;
  /** Optional known email (e.g. reset/change-password) for policy checks. */
  emailHint?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [values, setValues] = useState<Record<string, string>>({});
  const submittedInvalid = Boolean(state.error && !state.ok);

  function setFieldValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      {fields.map((field) => {
        const isPassword = field.type === "password";
        const emailForPolicy =
          emailHint ||
          (field.emailFieldName
            ? values[field.emailFieldName] || ""
            : undefined);

        if (isPassword) {
          return (
            <div key={field.name} className="space-y-2">
              <PasswordField
                name={field.name}
                label={field.label}
                autoComplete={field.autoComplete}
                required={field.required !== false}
                onValueChange={(value) => setFieldValue(field.name, value)}
                error={state.fieldErrors?.[field.name]}
              />
              {field.showRequirements ? (
                <PasswordRequirements
                  password={values[field.name] || ""}
                  email={emailForPolicy}
                  highlightUnmet={
                    submittedInvalid || Boolean(state.fieldErrors?.[field.name])
                  }
                />
              ) : null}
              {field.matchWith ? (
                <PasswordConfirmStatus
                  password={values[field.matchWith] || ""}
                  confirmPassword={values[field.name] || ""}
                />
              ) : null}
            </div>
          );
        }

        return (
          <div key={field.name}>
            <label
              htmlFor={field.name}
              className="mb-1.5 block text-sm font-medium text-[var(--heading)]"
            >
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type={field.type || "text"}
              autoComplete={field.autoComplete}
              required={field.required !== false}
              onChange={(event) =>
                setFieldValue(field.name, event.currentTarget.value)
              }
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-3 text-sm text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
            />
            {state.fieldErrors?.[field.name] ? (
              <p className="mt-1 text-xs text-[var(--danger-text)]" role="alert">
                {state.fieldErrors[field.name]}
              </p>
            ) : null}
          </div>
        );
      })}

      {extras}

      {state.error ? (
        <p
          className={`rounded-xl border px-3 py-2 text-sm ${
            state.ok
              ? "border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 text-[var(--heading)]"
              : "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
          }`}
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      {state.ok && !state.error && successMessage ? (
        <p
          className="rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-3 py-2 text-sm"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
      >
        {pending ? "Please wait…" : submitLabel}
      </button>

      {footer}
    </form>
  );
}

export function AuthFooterLinks({
  links,
}: {
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? " · " : null}
          <Link
            href={link.href}
            className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            {link.label}
          </Link>
        </span>
      ))}
    </p>
  );
}
