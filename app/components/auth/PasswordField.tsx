"use client";

import {
  useId,
  useState,
  type ChangeEventHandler,
  type FocusEventHandler,
} from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  id?: string;
  defaultValue?: string;
  value?: string;
  readOnly?: boolean;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onValueChange?: (value: string) => void;
  error?: string;
  className?: string;
};

export default function PasswordField({
  name,
  label,
  autoComplete,
  required = true,
  id,
  defaultValue,
  value,
  readOnly,
  onFocus,
  onValueChange,
  error,
  className = "",
}: PasswordFieldProps) {
  const reactId = useId();
  const inputId = id || `${name}-${reactId}`;
  const [visible, setVisible] = useState(false);
  const controlled = value !== undefined;

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onValueChange?.(event.currentTarget.value);
  };

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-medium text-[var(--heading)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          readOnly={readOnly}
          onFocus={onFocus}
          {...(controlled
            ? { value }
            : { defaultValue: defaultValue ?? "" })}
          onChange={handleChange}
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] py-3 pl-4 pr-12 text-sm text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-[var(--text-muted)] transition hover:text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
