"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useCookieConsent } from "@/app/components/cookies/CookieConsentProvider";

function CategoryRow({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-semibold text-[var(--heading)]">
            {title}
          </label>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
            {description}
          </p>
        </div>
        {disabled ? (
          <span className="shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--page-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)]">
            Always on
          </span>
        ) : (
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={checked}
            onChange={(event) => onChange?.(event.currentTarget.checked)}
            className="mt-1 h-5 w-9 shrink-0 cursor-pointer accent-[var(--accent-strong)]"
            aria-checked={checked}
          />
        )}
      </div>
    </div>
  );
}

export default function CookiePreferencesModal({
  pending,
}: {
  pending: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const {
    consent,
    preferencesOpen,
    closePreferences,
    acceptAll,
    rejectNonEssential,
    savePreferences,
  } = useCookieConsent();

  // Draft toggles — opening the panel must not enable optional categories.
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const consentPreferences = Boolean(consent?.preferences);
  const consentAnalytics = Boolean(consent?.analytics);
  const consentMarketing = Boolean(consent?.marketing);

  // Sync drafts when the modal opens or saved consent changes (render-time adjust).
  const [draftSource, setDraftSource] = useState<{
    open: boolean;
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  }>({ open: false, preferences: false, analytics: false, marketing: false });

  if (preferencesOpen) {
    if (
      !draftSource.open ||
      draftSource.preferences !== consentPreferences ||
      draftSource.analytics !== consentAnalytics ||
      draftSource.marketing !== consentMarketing
    ) {
      setDraftSource({
        open: true,
        preferences: consentPreferences,
        analytics: consentAnalytics,
        marketing: consentMarketing,
      });
      setPreferences(consentPreferences);
      setAnalytics(consentAnalytics);
      setMarketing(consentMarketing);
    }
  } else if (draftSource.open) {
    setDraftSource({
      open: false,
      preferences: false,
      analytics: false,
      marketing: false,
    });
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (preferencesOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [preferencesOpen]);

  function handleCancel() {
    closePreferences();
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    await savePreferences({ preferences, analytics, marketing });
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed left-1/2 top-1/2 z-50 m-0 w-[min(100%-1.5rem,32rem)] max-h-[min(88vh,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-0 text-[var(--heading)] shadow-[var(--shadow-strong)] open:flex open:flex-col backdrop:bg-black/45"
      onClose={handleCancel}
      onCancel={(event) => {
        event.preventDefault();
        handleCancel();
      }}
    >
      <form onSubmit={handleSave} className="flex flex-col gap-4 p-4 sm:p-6">
        <div>
          <h2 id={titleId} className="text-lg font-bold tracking-tight">
            Cookie preferences
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
            Essential cookies stay on for login and security. Optional categories
            start off unless you enable them.
          </p>
        </div>

        <div className="space-y-3">
          <CategoryRow
            id="cookie-essential"
            title="Essential cookies"
            description="Required for login, sessions, security and fraud-prevention. These cannot be disabled."
            checked
            disabled
          />
          <CategoryRow
            id="cookie-preferences"
            title="Preference cookies"
            description="Remember optional display or site preference choices when such cookies are used."
            checked={preferences}
            onChange={setPreferences}
          />
          <CategoryRow
            id="cookie-analytics"
            title="Analytics cookies"
            description="Help understand site usage if analytics tools are introduced later. Not required for accounts or purchases."
            checked={analytics}
            onChange={setAnalytics}
          />
          <CategoryRow
            id="cookie-marketing"
            title="Marketing cookies"
            description="Optional marketing or live-chat support tools (for example Tawk.to) when enabled. Not required for browsing, checkout or account login."
            checked={marketing}
            onChange={setMarketing}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={pending}
              onClick={() => void rejectNonEssential()}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 text-sm font-semibold text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
            >
              Reject non-essential
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void acceptAll()}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-4 text-sm font-semibold text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
            >
              Accept all
            </button>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save preferences"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleCancel}
            className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-medium text-[var(--text-muted)] hover:text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
