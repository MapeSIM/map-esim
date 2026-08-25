"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_NAME_MAX,
  CONTACT_NAME_MIN,
  CONTACT_SUBJECT_MAX,
  CONTACT_SUBJECT_MIN,
} from "@/app/lib/contact/contactLimits";
import {
  submitContactFormAction,
  type ContactFormState,
} from "@/app/lib/contact/submitContactForm";
import { BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";

const initialState: ContactFormState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="
        inline-flex h-12 w-full items-center justify-center rounded-2xl
        bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)]
        transition hover:opacity-95
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--accent-strong)]/60
        disabled:cursor-not-allowed disabled:opacity-60
        sm:w-auto
      "
    >
      {pending ? "Sending…" : "Send message"}
    </button>
  );
}

const fieldClass = `
  mt-2 w-full rounded-2xl border border-[var(--border-strong)]
  bg-[var(--surface)] px-4 py-3 text-sm text-[var(--heading)]
  placeholder:text-[var(--text-soft)]
  focus:border-[var(--accent-strong)]/60 focus:outline-none
  focus:ring-2 focus:ring-[var(--accent-strong)]/25
`;

export default function ContactForm() {
  const [state, formAction] = useActionState(
    submitContactFormAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const success = state.status === "success";

  useEffect(() => {
    if (success) {
      formRef.current?.reset();
    }
  }, [success]);

  const mailtoFallback = `mailto:${BRAND_SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "MAP eSIM support request"
  )}`;

  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
      <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
        Send a message
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Tell us how we can help. We use your email only to reply to this request.
      </p>

      {success ? (
        <div
          role="status"
          className="mt-6 rounded-2xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-4 py-4 text-sm leading-relaxed text-[var(--heading)]"
        >
          Thanks — your message was sent. Our support team will reply by email
          when they can. For installation steps, see the guides linked on this
          page.
        </div>
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-4 text-sm leading-relaxed text-[var(--warning-text)]"
        >
          <p>{state.message}</p>
          {(state.code === "not_configured" || state.code === "send_failed") && (
            <p className="mt-2">
              You can also email{" "}
              <a
                href={mailtoFallback}
                className="font-semibold underline underline-offset-2"
              >
                {BRAND_SUPPORT_EMAIL}
              </a>
              .
            </p>
          )}
        </div>
      ) : null}

      <form ref={formRef} action={formAction} className="mt-6 space-y-5" noValidate>
        {/* Honeypot — visually hidden, not a real contact field. */}
        <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="fax_number">Fax</label>
          <input
            id="fax_number"
            name="fax_number"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="name" className="text-sm font-medium text-[var(--heading)]">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={CONTACT_NAME_MIN}
            maxLength={CONTACT_NAME_MAX}
            autoComplete="name"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="email" className="text-sm font-medium text-[var(--heading)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={CONTACT_EMAIL_MAX}
            autoComplete="email"
            inputMode="email"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="subject" className="text-sm font-medium text-[var(--heading)]">
            Subject
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            required
            minLength={CONTACT_SUBJECT_MIN}
            maxLength={CONTACT_SUBJECT_MAX}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="message" className="text-sm font-medium text-[var(--heading)]">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            required
            minLength={CONTACT_MESSAGE_MIN}
            maxLength={CONTACT_MESSAGE_MAX}
            rows={6}
            className={`${fieldClass} resize-y`}
          />
          <p className="mt-1.5 text-xs text-[var(--text-soft)]">
            {CONTACT_MESSAGE_MIN}–{CONTACT_MESSAGE_MAX} characters. Do not include
            passwords, full card numbers, QR codes, or activation secrets.
          </p>
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}
