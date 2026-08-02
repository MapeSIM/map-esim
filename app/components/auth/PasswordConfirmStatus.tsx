"use client";

export default function PasswordConfirmStatus({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) {
  if (!password && !confirmPassword) {
    return null;
  }

  const matches = password === confirmPassword && confirmPassword.length > 0;

  return (
    <p
      className={`text-xs font-medium ${
        matches
          ? "text-[var(--accent-strong)]"
          : "text-[var(--danger-text)]"
      }`}
      role="status"
      aria-live="polite"
    >
      {matches ? "Passwords match" : "Passwords do not match"}
    </p>
  );
}
