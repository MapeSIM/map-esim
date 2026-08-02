"use client";

import { useActionState, useState } from "react";
import PasswordField from "@/app/components/auth/PasswordField";
import type { AuthActionState } from "@/app/lib/auth/actions";
import {
  deleteAccountAction,
  requestAccountDeletionOtpAction,
} from "@/app/lib/auth/actions";

const initialState: AuthActionState = { ok: false };

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export default function DeleteAccountSection({
  isCustomer,
}: {
  isCustomer: boolean;
}) {
  // Collapsed by default — in-memory only (never URL / cookie / localStorage).
  const [open, setOpen] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [passwordLocked, setPasswordLocked] = useState(true);
  const [otpLocked, setOtpLocked] = useState(true);

  const [otpState, otpAction, otpPending] = useActionState(
    requestAccountDeletionOtpAction,
    initialState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteAccountAction,
    initialState
  );

  function resetFormFields() {
    setPassword("");
    setOtp("");
    setConfirmation("");
    setAcknowledged(false);
    setPasswordLocked(true);
    setOtpLocked(true);
  }

  function openPanel() {
    resetFormFields();
    setFormEpoch((epoch) => epoch + 1);
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    resetFormFields();
  }

  const canDelete =
    password.length > 0 &&
    /^[0-9]{6}$/.test(otp) &&
    acknowledged &&
    confirmation === "DELETE";

  if (!isCustomer) {
    return (
      <section className="space-y-3 border-t border-[var(--danger-border)] pt-8">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--danger-text)]">
          Danger zone
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Admin accounts cannot be deleted through the customer deletion flow.
        </p>
      </section>
    );
  }

  const status = deleteState.error
    ? deleteState
    : otpState.error
      ? otpState
      : null;

  return (
    <section className="space-y-4 border-t border-[var(--danger-border)] pt-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--danger-text)]">
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Permanently delete your MAP eSIM account. Past eSIM purchases remain
          available through your secure order links. This cannot be undone.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={openPanel}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 text-sm font-semibold text-[var(--danger-text)]"
        >
          Delete my account
        </button>
      ) : (
        <form
          key={formEpoch}
          className="relative space-y-4 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)]/40 p-4 sm:p-5"
          role="region"
          aria-label="Confirm account deletion"
          autoComplete="off"
        >
          {/* Autofill sinks: absorb username/password manager fills away from OTP. */}
          <div
            className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
            aria-hidden="true"
          >
            <input
              type="text"
              tabIndex={-1}
              autoComplete="username"
              name="delete_account_username_sink"
              defaultValue=""
            />
            <input
              type="password"
              tabIndex={-1}
              autoComplete="new-password"
              name="delete_account_password_sink"
              defaultValue=""
            />
          </div>

          <p className="text-sm font-medium text-[var(--heading)]">
            Confirm account deletion
          </p>

          <PasswordField
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
            value={password}
            readOnly={passwordLocked}
            onFocus={() => setPasswordLocked(false)}
            onValueChange={setPassword}
            error={
              deleteState.fieldErrors?.currentPassword ||
              otpState.fieldErrors?.currentPassword
            }
          />

          <button
            type="submit"
            formAction={otpAction}
            disabled={otpPending || deletePending || password.length === 0}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
          >
            {otpPending ? "Sending code…" : "Send verification code"}
          </button>

          <div>
            <label
              htmlFor="delete-account-otp"
              className="mb-1.5 block text-sm font-medium text-[var(--heading)]"
            >
              6-digit email verification code
            </label>
            <input
              id="delete-account-otp"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={6}
              pattern="[0-9]{6}"
              value={otp}
              readOnly={otpLocked}
              onFocus={() => setOtpLocked(false)}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                // Reject username/email autofill; keep digits only.
                if (raw.includes("@") || /[a-zA-Z]/.test(raw)) {
                  setOtp("");
                  return;
                }
                setOtp(digitsOnly(raw));
              }}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-3 text-sm tracking-[0.2em] text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
              aria-describedby="delete-otp-hint"
            />
            <p
              id="delete-otp-hint"
              className="mt-1 text-xs text-[var(--text-muted)]"
            >
              Enter the code sent to your verified email.
            </p>
            {deleteState.fieldErrors?.otp ? (
              <p className="mt-1 text-xs text-[var(--danger-text)]" role="alert">
                {deleteState.fieldErrors.otp}
              </p>
            ) : null}
          </div>

          <label className="flex items-start gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              name="acknowledge"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
              className="mt-1 h-4 w-4 rounded border-[var(--border-strong)]"
            />
            <span>I understand that this action cannot be undone.</span>
          </label>

          <div>
            <label
              htmlFor="delete-confirmation"
              className="mb-1.5 block text-sm font-medium text-[var(--heading)]"
            >
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirmation"
              name="confirmation"
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              autoCorrect="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 py-3 text-sm font-semibold tracking-wide text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
            />
            {deleteState.fieldErrors?.confirmation ? (
              <p className="mt-1 text-xs text-[var(--danger-text)]" role="alert">
                {deleteState.fieldErrors.confirmation}
              </p>
            ) : null}
          </div>

          {status?.error ? (
            <p
              className={`rounded-xl border px-3 py-2 text-sm ${
                status.ok
                  ? "border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 text-[var(--heading)]"
                  : "border-[var(--danger-border)] bg-[var(--page-bg)] text-[var(--danger-text)]"
              }`}
              role={status.ok ? "status" : "alert"}
            >
              {status.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              formAction={deleteAction}
              disabled={!canDelete || deletePending || otpPending}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--danger-text)] px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {deletePending ? "Deleting…" : "Permanently delete account"}
            </button>
            <button
              type="button"
              onClick={closePanel}
              disabled={deletePending}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
