import AdminNav from "@/app/components/admin/AdminNav";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("ADMIN");

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-8 text-[var(--heading)] sm:px-6 sm:py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[240px_1fr]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <AdminNav adminName={user.name || "Administrator"} />
        </div>
        <section className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
