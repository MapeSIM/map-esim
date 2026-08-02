"use client";

import {
  evaluatePasswordRequirements,
  PASSWORD_CHECKLIST_KEYS,
  PASSWORD_REQUIREMENT_LABELS,
  type PasswordRequirementKey,
} from "@/app/lib/auth/password";

const SECONDARY_KEYS: PasswordRequirementKey[] = [
  "maxLength",
  "noEdgeSpaces",
  "notEmail",
];

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
  const state = evaluatePasswordRequirements(password, email);

  const visibleKeys: PasswordRequirementKey[] = [
    ...PASSWORD_CHECKLIST_KEYS,
    ...SECONDARY_KEYS.filter((key) => {
      if (key === "notEmail" && !(email || "").trim()) return false;
      // Keep secondary rules out of the default checklist; surface when relevant.
      if (state[key]) {
        return highlightUnmet === false && key === "maxLength"
          ? password.length > 100
          : false;
      }
      return password.length > 0 || highlightUnmet;
    }),
  ];

  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3"
      aria-live="polite"
    >
      <p className="text-xs font-semibold text-[var(--heading)]">
        Your password must contain:
      </p>
      <ul className="mt-2 space-y-1.5">
        {visibleKeys.map((key) => {
          const met = state[key];
          return (
            <li
              key={key}
              className={`flex items-start gap-2 text-xs leading-snug ${
                met
                  ? "text-[var(--accent-strong)]"
                  : highlightUnmet
                    ? "text-[var(--danger-text)]"
                    : "text-[var(--text-muted)]"
              }`}
            >
              <span
                className={`mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
                  met
                    ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]/15 text-[var(--accent-ink)]"
                    : "border-[var(--border-strong)]"
                }`}
                aria-hidden="true"
              >
                {met ? "✓" : ""}
              </span>
              <span>{PASSWORD_REQUIREMENT_LABELS[key]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
