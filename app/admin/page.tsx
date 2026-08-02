export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Protected admin shell. Destructive admin tools are intentionally limited.
      </p>
    </div>
  );
}
