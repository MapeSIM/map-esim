import AdminPlaceholder from "@/app/components/admin/AdminPlaceholder";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <AdminPlaceholder
      title="Settings"
      description="Operational tools and controlled admin actions arrive in a later phase. Environment secrets are never shown in the admin UI."
    />
  );
}
