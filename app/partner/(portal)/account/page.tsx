import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import { listPartnerApiKeysForUser } from "@/app/lib/partner/partnerApiKeys";
import { getPartnerShareBranding } from "@/app/lib/partner/partnerShareBranding";
import PartnerApiKeysManager from "@/app/components/partner/PartnerApiKeysManager";
import PartnerShareBrandingForm from "@/app/components/partner/PartnerShareBrandingForm";

export const dynamic = "force-dynamic";

export default async function PartnerAccountPage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return <p className="text-sm text-slate-300">Partner access is unavailable.</p>;
  }

  const [profile, keys, branding] = await Promise.all([
    prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: {
        apiEnabled: true,
        createdAt: true,
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

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-50">Account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Profile, API keys, and white-label Share QR branding.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold text-slate-50">Profile</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
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
              {profile?.apiEnabled ? "Enabled" : "Disabled"}
            </dd>
          </div>
        </dl>
      </section>

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
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-2 sm:p-4 [&_*]:!text-inherit">
            <PartnerShareBrandingForm initial={branding.branding} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">{branding.error}</p>
        )}
      </section>
    </div>
  );
}
