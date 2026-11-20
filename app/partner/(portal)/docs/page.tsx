import Link from "next/link";
import { requireRole } from "@/app/lib/auth/session";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { prisma } from "@/app/lib/db";
import {
  CANCEL_REASON_CODES,
} from "@/app/lib/partnerApiAuth";
import {
  PARTNER_DOCS_TOC,
} from "@/app/lib/partner/partnerApiDocsContent";
import PartnerApiDocsClient from "@/app/components/partner/PartnerApiDocsClient";

export const dynamic = "force-dynamic";

export default async function PartnerDocsPage() {
  const user = await requireRole("PARTNER");
  const actor = await requireActivePartnerActor(user.id);
  if (!actor) {
    return <p className="text-sm text-slate-300">Partner access is unavailable.</p>;
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: actor.partnerId },
    select: { apiEnabled: true },
  });

  if (!profile?.apiEnabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-50">API docs</h1>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-6">
          <p className="text-lg font-semibold text-amber-200">
            API Access Locked — Contact Admin to Enable
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Your Partner Public API is disabled. Once an admin enables API
            access on your account, docs, downloads, and API key minting unlock
            here.
          </p>
          <Link
            href="/partner/account"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950"
          >
            Go to Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PartnerApiDocsClient
      toc={[...PARTNER_DOCS_TOC]}
      cancelReasonCodes={[...CANCEL_REASON_CODES]}
    />
  );
}
