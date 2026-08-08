"use client";

import {
  evaluatePasswordRequirements,
  PASSWORD_REQUIREMENT_MESSAGE,
} from "@/app/lib/auth/password";

export default function PasswordRequirements({
  password,
  email,
  highlightUnmet = false,
}: {
  password: string;
  email?: string | null;
  /** After a failed submit, emphasize unmet rules. */
  highlightUnmet?: boolean;
}) {
  const met = evaluatePasswordRequirements(password, email).minLength;
  const showAsError = highlightUnmet && !met;

  return (
    <p
      className={`text-xs leading-snug ${
        showAsError
          ? "text-[var(--danger-text)]"
          : met
            ? "text-[var(--accent-strong)]"
            : "text-[var(--text-muted)]"
      }`}
      aria-live="polite"
    >
      {PASSWORD_REQUIREMENT_MESSAGE}
    </p>
  );
}
