import Link from "next/link";

export function CustomerEsimInstallHelpLinks({
  className,
}: {
  className?: string;
}) {
  return (
    <p className={className ?? "text-sm text-[var(--text-muted)]"}>
      Installation help:{" "}
      <Link
        href="/install/iphone"
        className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        iPhone
      </Link>
      <span className="text-[var(--text-soft)]"> · </span>
      <Link
        href="/install/android"
        className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        Android
      </Link>
    </p>
  );
}
