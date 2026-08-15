import {
  AdminUsersTable,
  InviteAdminForm,
} from "@/app/components/admin/AdminUsersPanel";
import { listAdminUsers } from "@/app/lib/admin/adminUsers";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

const ADMIN_USERS_UNAVAILABLE =
  "Admin user data is temporarily unavailable. Please refresh shortly.";

export default async function AdminUsersPage() {
  const admin = await requireRole("ADMIN");

  let rows: Awaited<ReturnType<typeof listAdminUsers>>;
  try {
    rows = await listAdminUsers(admin.id);
  } catch {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Admin Users</h1>
        </header>
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {ADMIN_USERS_UNAVAILABLE}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Admin Users</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Invite and manage dedicated admin accounts. Each admin uses their own
          password. Password hashes, OTP codes, and session details are never
          shown here.
        </p>
      </header>

      <InviteAdminForm />

      <section className="space-y-3" aria-label="Admin accounts">
        <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
          Administrators
        </h2>
        <AdminUsersTable rows={rows} />
      </section>
    </div>
  );
}
