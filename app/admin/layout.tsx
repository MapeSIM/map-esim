import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminNav from "@/app/components/admin/AdminNav";
import { loadAdminAccess } from "@/app/lib/admin/adminPermissionAccess";
import { canAccessAdminPath } from "@/app/lib/admin/adminPageAccess";
import { hasAdminPermission } from "@/app/lib/admin/adminPermissions";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("ADMIN");
  const access = await loadAdminAccess(user.id);
  if (!access) {
    redirect("/signin");
  }

  const headerStore = await headers();
  const pathname = headerStore.get("x-map-pathname");
  if (!pathname) {
    // Fail closed when the request path is unknown. Super Admin still continues.
    if (!hasAdminPermission(access.permissions, "MANAGE_ADMINS")) {
      redirect("/admin?forbidden=1");
    }
  } else if (
    pathname !== "/admin" &&
    !canAccessAdminPath(access.permissions, pathname)
  ) {
    redirect("/admin?forbidden=1");
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-4 py-8 text-[var(--heading)] sm:px-6 sm:py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[240px_1fr]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <AdminNav
            adminName={user.name || "Administrator"}
            permissions={[...access.permissions]}
          />
        </div>
        <section className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
