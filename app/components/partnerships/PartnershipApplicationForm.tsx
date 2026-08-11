"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  PARTNERSHIP_ABOUT_MAX,
  PARTNERSHIP_COMPANY_MAX,
  PARTNERSHIP_COUNTRY_MAX,
  PARTNERSHIP_EMAIL_MAX,
  PARTNERSHIP_NAME_MAX,
  PARTNERSHIP_PHONE_MAX,
  PARTNERSHIP_POSTAL_MAX,
  PARTNERSHIP_REGISTRATION_MAX,
  PARTNERSHIP_VOLUME_OPTIONS,
  PARTNERSHIP_WEBSITE_MAX,
  partnershipVolumeLabel,
} from "@/app/lib/partnerships/partnershipLimits";
import {
  submitPartnershipFormAction,
  type PartnershipFormState,
} from "@/app/lib/partnerships/submitPartnershipForm";

const initialState: PartnershipFormState = { status: "idle" };

const fieldClass = `
  mt-2 w-full rounded-2xl border border-[var(--border-strong)]
  bg-[var(--surface)] px-4 py-3 text-sm text-[var(--heading)]
  placeholder:text-[var(--text-soft)]
  focus:border-[var(--accent-strong)]/60 focus:outline-none
  focus:ring-2 focus:ring-[var(--accent-strong)]/25
`;

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
      {pending ? "Submitting…" : "Submit application"}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs text-[var(--warning-text)]" role="alert">
      {message}
    </p>
  );
}

export default function PartnershipApplicationForm() {
  const [state, formAction] = useActionState(
    submitPartnershipFormAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const success = state.status === "success";
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  useEffect(() => {
    if (success) {
      formRef.current?.reset();
    }
  }, [success]);

  const mailtoFallback = `mailto:${BRAND_SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "MAP eSIM partnership inquiry"
  )}`;

  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
      <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
        Partnership application
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Share a few details about your business. Our team reviews every
        application — approval is not automatic.
      </p>

      {success ? (
        <div
          role="status"
          className="mt-6 rounded-2xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 px-4 py-4 text-sm leading-relaxed text-[var(--heading)]"
        >
          Thanks — your partnership application was sent. MAP eSIM will review
          it and reply by email when we can.
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

      <form ref={formRef} action={formAction} className="mt-6 space-y-4" noValidate>
        {/* Honeypot — visually hidden, not a real partnership field. */}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className="text-sm font-semibold text-[var(--heading)]">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              maxLength={PARTNERSHIP_NAME_MAX}
              autoComplete="name"
              className={fieldClass}
            />
            <FieldError message={fieldErrors?.fullName} />
          </div>
          <div>
            <label htmlFor="companyName" className="text-sm font-semibold text-[var(--heading)]">
              Business / company name
            </label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              required
              maxLength={PARTNERSHIP_COMPANY_MAX}
              autoComplete="organization"
              className={fieldClass}
            />
            <FieldError message={fieldErrors?.companyName} />
          </div>
        </div>

        <div>
          <label htmlFor="registrationNumber" className="text-sm font-semibold text-[var(--heading)]">
            Registration number <span className="font-normal text-[var(--text-soft)]">(optional)</span>
          </label>
          <input
            id="registrationNumber"
            name="registrationNumber"
            type="text"
            maxLength={PARTNERSHIP_REGISTRATION_MAX}
            className={fieldClass}
          />
          <FieldError message={fieldErrors?.registrationNumber} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="businessEmail" className="text-sm font-semibold text-[var(--heading)]">
              Business email
            </label>
            <input
              id="businessEmail"
              name="businessEmail"
              type="email"
              required
              maxLength={PARTNERSHIP_EMAIL_MAX}
              autoComplete="email"
              className={fieldClass}
            />
            <FieldError message={fieldErrors?.businessEmail} />
          </div>
          <div>
            <label htmlFor="phone" className="text-sm font-semibold text-[var(--heading)]">
              Phone number
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              maxLength={PARTNERSHIP_PHONE_MAX}
              autoComplete="tel"
              className={fieldClass}
            />
            <FieldError message={fieldErrors?.phone} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="country" className="text-sm font-semibold text-[var(--heading)]">
              Country
            </label>
            <input
              id="country"
              name="country"
              type="text"
              required
              maxLength={PARTNERSHIP_COUNTRY_MAX}
              autoComplete="country-name"
              className={fieldClass}
            />
            <FieldError message={fieldErrors?.country} />
          </div>
          <div>
            <label htmlFor="postalCode" className="text-sm font-semibold text-[var(--heading)]">
              ZIP / postal code
            </label>
            <input
              id="postalCode"
              name="postalCode"
              type="text"
              required
              maxLength={PARTNERSHIP_POSTAL_MAX}
              autoComplete="postal-code"
              className={fieldClass}
            />
            <FieldError message={fieldErrors?.postalCode} />
          </div>
        </div>

        <div>
          <label htmlFor="website" className="text-sm font-semibold text-[var(--heading)]">
            Website or social profile{" "}
            <span className="font-normal text-[var(--text-soft)]">(optional)</span>
          </label>
          <input
            id="website"
            name="website"
            type="text"
            maxLength={PARTNERSHIP_WEBSITE_MAX}
            placeholder="https://… or @handle"
            className={fieldClass}
          />
          <FieldError message={fieldErrors?.website} />
        </div>

        <div>
          <label htmlFor="about" className="text-sm font-semibold text-[var(--heading)]">
            Tell us about your business / audience
          </label>
          <textarea
            id="about"
            name="about"
            required
            rows={5}
            maxLength={PARTNERSHIP_ABOUT_MAX}
            className={`${fieldClass} min-h-[140px] resize-y`}
          />
          <FieldError message={fieldErrors?.about} />
        </div>

        <div>
          <label htmlFor="expectedVolume" className="text-sm font-semibold text-[var(--heading)]">
            Expected monthly volume
          </label>
          <select
            id="expectedVolume"
            name="expectedVolume"
            required
            defaultValue=""
            className={fieldClass}
          >
            <option value="" disabled>
              Select an estimate…
            </option>
            {PARTNERSHIP_VOLUME_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {partnershipVolumeLabel(value)}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors?.expectedVolume} />
        </div>

        <p className="text-xs leading-relaxed text-[var(--text-soft)]">
          Submitting this form does not create a partnership agreement and does
          not guarantee approval. We use the details you share only to review
          your application and reply.
        </p>

        <SubmitButton />
      </form>
    </div>
  );
}
