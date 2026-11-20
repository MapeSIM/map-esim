import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import { listPartnerApiKeysForUser } from "@/app/lib/partner/partnerApiKeys";
import { getPartnerShareBranding } from "@/app/lib/partner/partnerShareBranding";
import PartnerApiKeysManager from "@/app/components/partner/PartnerApiKeysManager";
import PartnerShareBrandingForm from "@/app/components/partner/PartnerShareBrandingForm";
import PartnerBrandingPreviewCard from "@/app/components/partner/PartnerBrandingPreviewCard";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";

export const dynamic = "force-dynamic";

export default async function PartnerAccountPage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return (
      <p className="text-sm text-slate-300">Partner access is unavailable.</p>
    );
  }

  const [profile, keys, branding] = await Promise.all([
    prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: {
        apiEnabled: true,
        createdAt: true,
        brandCompanyName: true,
        brandSupportEmail: true,
        brandButtonBg: true,
        brandButtonText: true,
        shareCompanyName: true,
        shareSupportEmail: true,
        shareButtonBackground: true,
        shareButtonTextColor: true,
        user: { select: { email: true, name: true, emailVerifiedAt: true } },
      },
    }),
    listPartnerApiKeysForUser(user.id),
    getPartnerShareBranding(user.id),
  ]);

  const memberSince = profile?.createdAt
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(profile.createdAt) + " UTC"
    : "Not available";

  const preview = {
    companyName:
      profile?.brandCompanyName ||
      profile?.shareCompanyName ||
      actor.name,
    supportEmail:
      profile?.brandSupportEmail || profile?.shareSupportEmail || actor.email,
    buttonBg:
      profile?.brandButtonBg || profile?.shareButtonBackground || "#10B981",
    buttonText:
      profile?.brandButtonText || profile?.shareButtonTextColor || "#020617",
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-50">Account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Profile, API keys, and white-label Share QR branding.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={partnerCardClass}>
          <h2 className="text-lg font-semibold text-slate-50">
            Partner profile
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Partner name
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {profile?.user.name ?? actor.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Email
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {profile?.user.email ?? actor.email}
                {profile?.user.emailVerifiedAt ? (
                  <span className="ml-2 text-xs font-semibold text-emerald-400">
                    Verified
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Member since
              </dt>
              <dd className="mt-1 text-sm text-slate-100">{memberSince}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                API access
              </dt>
              <dd className="mt-1 text-sm text-slate-100">
                {profile?.apiEnabled ? (
                  <span className="font-semibold text-emerald-300">Enabled</span>
                ) : (
                  <span className="font-semibold text-amber-300">Disabled</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <PartnerBrandingPreviewCard
          companyName={preview.companyName}
          supportEmail={preview.supportEmail}
          buttonBg={preview.buttonBg}
          buttonText={preview.buttonText}
        />
      </div>

      <PartnerApiKeysManager
        apiEnabled={profile?.apiEnabled === true}
        keys={keys ?? []}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">
            White-Label Share QR Branding
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Custom company name, support email, and button colors for public
            share pages of your Partner orders.
          </p>
        </div>
        {branding.ok ? (
          <div className={`${partnerCardClass} [&_input]:!bg-[#070D19] [&_input]:!text-slate-100 [&_label]:!text-slate-300`}>
            <PartnerShareBrandingForm initial={branding.branding} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">{branding.error}</p>
        )}
      </section>
    </div>
  );
}
