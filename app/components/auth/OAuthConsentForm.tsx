"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthCard from "@/app/components/auth/AuthCard";
import {
  acceptGoogleOauthConsentAction,
  type OAuthConsentActionState,
} from "@/app/lib/auth/oauthConsentActions";
import { LEGAL_CONSENT_ERROR } from "@/app/lib/auth/googleOAuth";
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import { signOutAction } from "@/app/lib/auth/actions";

const initialState: OAuthConsentActionState = { ok: false };

export default function OAuthConsentForm() {
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackPath(
    searchParams.get("callbackUrl"),
    "/account"
  );
  const [state, formAction, pending] = useActionState(
    acceptGoogleOauthConsentAction,
    initialState
  );
  const [checked, setChecked] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const error =
    clientError || state.fieldErrors?.terms || state.error || null;

  return (
    <AuthCard
      title="Almost there"
      subtitle="Please review and accept our Terms & Conditions and Privacy Policy to finish creating your MAP eSIM account with Google."
    >
      <form
        action={formAction}
        className="space-y-5"
        onSubmit={(event) => {
          if (!checked) {
            event.preventDefault();
            setClientError(LEGAL_CONSENT_ERROR);
          }
        }}
      >
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        <label className="flex items-start gap-3 text-sm leading-snug text-[var(--text)]">
          <input
            type="checkbox"
            name="terms"
            checked={checked}
            onChange={(event) => {
              setChecked(event.currentTarget.checked);
              if (event.currentTarget.checked) setClientError(null);
            }}
            className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border-strong)]"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "oauth-consent-error" : undefined}
          />
          <span className="min-w-0">
            I agree to the{" "}
            <Link
              href="/terms-and-conditions"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms & Conditions
            </Link>{" "}
            and acknowledge the{" "}
            <Link
              href="/privacy-policy"
              className="font-medium text-[var(--accent-strong)] underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {error ? (
          <p
            id="oauth-consent-error"
            className="text-xs text-[var(--danger-text)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="
            inline-flex h-11 w-full items-center justify-center
            rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold
            text-[var(--accent-ink)] transition
            hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60
          "
        >
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>

      <form action={signOutAction} className="mt-4 text-center">
        <button
          type="submit"
          className="text-sm font-semibold text-[var(--text-muted)] underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </form>
    </AuthCard>
  );
}
