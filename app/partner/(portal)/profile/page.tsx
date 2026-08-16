import PartnerShareBrandingForm from "@/app/components/partner/PartnerShareBrandingForm";
import { requireRole } from "@/app/lib/auth/session";
import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { getPartnerShareBranding } from "@/app/lib/partner/partnerShareBranding";

export const dynamic = "force-dynamic";

export default async function PartnerProfilePage() {
  const user = await requireRole("PARTNER");
  let discountLabel = "—";
  try {
    const summary = await getPartnerPortalSummary(user.id);
    if (summary) discountLabel = summary.discountPercentLabel;
  } catch {
    discountLabel = "—";
  }

  const brandingResult = await getPartnerShareBranding(user.id);
  const branding = brandingResult.ok
    ? brandingResult.branding
    : {
        companyName: null,
        supportEmail: null,
        websiteUrl: null,
        logoUrl: null,
        buttonBackground: null,
        buttonTextColor: null,
      };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Profile editing arrives in a later phase. Your signed-in details are
          shown below.
        </p>
      </div>

      <section className="space-y-3 text-sm">
        <h2 className="text-lg font-semibold tracking-tight">Account Info</h2>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <p>
            <span className="text-[var(--text-soft)]">Name:</span>{" "}
            <b>{user.name}</b>
          </p>
          <p className="mt-2">
            <span className="text-[var(--text-soft)]">Email:</span>{" "}
            <b>{user.email}</b>
          </p>
          <p className="mt-2">
            <span className="text-[var(--text-soft)]">Partner discount:</span>{" "}
            <b>{discountLabel}</b>
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Share Branding</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Shown only on secure share pages for your eSIM orders. Public MAP
          storefront branding is unchanged.
        </p>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <PartnerShareBrandingForm initial={branding} />
        </div>
      </section>
    </div>
  );
}
