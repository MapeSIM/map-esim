import Link from "next/link";
import EmailCampaignForm from "@/app/components/admin/EmailCampaignForm";
import { requireRole } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminCreateEmailCampaignPage() {
  await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/email-campaigns"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          ← Email Campaigns
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          Create campaign
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Draft a customer broadcast. Preview and send from the campaign page
          after saving.
        </p>
      </div>
      <EmailCampaignForm />
    </div>
  );
}
