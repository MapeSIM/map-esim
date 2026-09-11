import { ReferralProgramSettingsPanel } from "@/app/components/admin/ReferralProgramSettingsPanel";
import { getAdminReferralProgramView } from "@/app/lib/referrals/referralProgramConfig";

export const dynamic = "force-dynamic";

const SETTINGS_UNAVAILABLE =
  "Referral settings are temporarily unavailable. Please refresh shortly.";

export default async function AdminSettingsPage() {
  let referralProgram: Awaited<
    ReturnType<typeof getAdminReferralProgramView>
  > | null = null;
  try {
    referralProgram = await getAdminReferralProgramView();
  } catch {
    referralProgram = null;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Operational admin configuration. Environment secrets are never shown
          in the admin UI.
        </p>
      </header>

      {referralProgram ? (
        <ReferralProgramSettingsPanel initial={referralProgram} />
      ) : (
        <div
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--heading)]">
            {SETTINGS_UNAVAILABLE}
          </p>
        </div>
      )}
    </div>
  );
}
