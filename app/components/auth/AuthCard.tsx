import type { ReactNode } from "react";

export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-12 text-[var(--heading)] sm:px-6">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            {subtitle}
          </p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
