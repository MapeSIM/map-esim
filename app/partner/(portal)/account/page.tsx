import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import { listPartnerApiKeysForUser } from "@/app/lib/partner/partnerApiKeys";
import { getPartnerShareBranding } from "@/app/lib/partner/partnerShareBranding";
import PartnerApiKeysManager from "@/app/components/partner/PartnerApiKeysManager";
import PartnerShareBrandingForm from "@/app/components/partner/PartnerShareBrandingForm";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";
import { BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";

export const dynamic = "force-dynamic";

export default async function PartnerAccountPage() {
  const domain = await readAppDomain();

  // mapesim.com — no API keys surface; branding lives on Profile (6a9cf44).
  if (domain !== "partner") {
    redirect("/partner/profile");
  }

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

  // partneresim.com — B2B account (API keys + branding).
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-50">Account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Profile, branding, API keys, and quick actions.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">
              Profile Information
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
            </dl>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-50">
              Share QR Branding
            </h2>
            <p className="text-sm text-slate-400">
              Company details and Install button colors for public share pages.
            </p>
            {branding.ok ? (
              <PartnerShareBrandingForm initial={branding.branding} />
            ) : (
              <p className="text-sm text-slate-400">{branding.error}</p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">
              Quick Actions
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/partner/docs"
                  className="font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  Open API docs →
                </Link>
              </li>
              <li>
                <Link
                  href="/partner/wallet"
                  className="font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  Top up wallet →
                </Link>
              </li>
              <li>
                <Link
                  href="/partner/countries"
                  className="font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  Browse catalog →
                </Link>
              </li>
            </ul>
          </section>

          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">
              Account Info
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Member since</dt>
                <dd className="text-slate-100">{memberSince}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">API access</dt>
                <dd
                  className={
                    profile?.apiEnabled
                      ? "font-semibold text-emerald-300"
                      : "font-semibold text-amber-300"
                  }
                >
                  {profile?.apiEnabled ? "Enabled" : "Disabled"}
                </dd>
              </div>
            </dl>
          </section>

          <PartnerApiKeysManager
            apiEnabled={profile?.apiEnabled === true}
            keys={keys ?? []}
          />

          <section className={partnerCardClass}>
            <h2 className="text-lg font-semibold text-slate-50">Need Help?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Contact Partner support at{" "}
              <a
                href={`mailto:${BRAND_SUPPORT_EMAIL}`}
                className="font-semibold text-emerald-400 hover:text-emerald-300"
              >
                {BRAND_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
