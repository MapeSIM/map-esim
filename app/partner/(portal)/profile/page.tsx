import { redirect } from "next/navigation";
import PartnerShareBrandingForm from "@/app/components/partner/PartnerShareBrandingForm";
import { requireRole } from "@/app/lib/auth/session";
import { getPartnerDiscountPercentLabel } from "@/app/lib/partner/partnerAccess";
import { getPartnerShareBranding } from "@/app/lib/partner/partnerShareBranding";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";

export const dynamic = "force-dynamic";

export default async function PartnerProfilePage() {
  const domain = await readAppDomain();

  // partneresim.com — branding lives on Account (API keys + branding).
  if (domain === "partner") {
    redirect("/partner/account");
  }

  // mapesim.com — 6a9cf44 profile + share branding (no API keys).
  const user = await requireRole("PARTNER");
  let discountLabel = "—";
  try {
    const label = await getPartnerDiscountPercentLabel(user.id);
    if (label) discountLabel = label;
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
          Profile editing arrives in a later phase. Manage share-page branding
          below.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Account Info</h2>
        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]">
            Signed-in partner
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
              <dt className="text-xs text-[var(--text-soft)]">Name</dt>
              <dd className="mt-1 font-semibold text-[var(--heading)]">
                {user.name}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
              <dt className="text-xs text-[var(--text-soft)]">Email</dt>
              <dd className="mt-1 font-semibold text-[var(--heading)]">
                {user.email}
              </dd>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 sm:col-span-2">
              <dt className="text-xs text-[var(--text-soft)]">
                Partner discount
              </dt>
              <dd className="mt-1 font-semibold text-[var(--heading)]">
                {discountLabel}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Share Branding</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Shown only on secure share pages for your eSIM orders. Public MAP
          storefront branding is unchanged.
        </p>
        <PartnerShareBrandingForm initial={branding} />
      </section>
    </div>
  );
}
