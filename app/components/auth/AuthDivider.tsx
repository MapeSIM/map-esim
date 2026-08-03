export default function AuthDivider({
  label = "or continue with email",
}: {
  label?: string;
}) {
  return (
    <div className="relative my-5" role="separator" aria-label={label}>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-[var(--border)]" />
      </div>
      <div className="relative flex justify-center text-xs uppercase tracking-[0.12em]">
        <span className="bg-[var(--surface)] px-3 text-[var(--text-soft)]">
          {label}
        </span>
      </div>
    </div>
  );
}
