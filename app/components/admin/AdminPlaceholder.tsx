export default function AdminPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
        {description}
      </p>
      <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-5 py-8 text-sm text-[var(--text-soft)]">
        Read-only placeholder for a later phase. No mutations are available
        here.
      </div>
    </div>
  );
}
