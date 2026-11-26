import Link from "next/link";
import { cookies } from "next/headers";
import PartnerApiDocsClient from "@/app/components/partner/PartnerApiDocsClient";
import { CANCEL_REASON_CODES } from "@/app/lib/partnerApiAuth";
import { PARTNER_DOCS_TOC } from "@/app/lib/partner/partnerApiDocsContent";
import { canSandboxPartnerUseApiUi } from "@/app/lib/sandbox/sandboxApiControls";
import {
  SANDBOX_SESSION_COOKIE,
  verifySandboxSession,
} from "@/app/lib/sandbox/sandboxPartnerDb";

/**
 * Sandbox Partner API docs — same contract as production with environment
 * switcher defaulting to mapesim.store /api/sandbox/v1.
 * Hidden when global or per-partner API access is OFF.
 */
export default async function SandboxDocsPage() {
  const jar = await cookies();
  const partnerId = verifySandboxSession(
    jar.get(SANDBOX_SESSION_COOKIE)?.value
  );
  const access = partnerId
    ? await canSandboxPartnerUseApiUi(partnerId)
    : { showApiUi: false, globalSandboxApiEnabled: false, apiEnabled: false };

  if (!access.showApiUi) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-white/[0.08] bg-[#0D1526] px-5 py-10 text-center">
        <h1 className="text-xl font-bold text-slate-50">API documentation</h1>
        <p className="text-sm text-slate-400">
          {!access.globalSandboxApiEnabled
            ? "Sandbox Partner API is temporarily disabled by an administrator."
            : "API access is disabled for this sandbox partner account. Contact partners@mapesim.com if you need it enabled."}
        </p>
        <Link
          href="/sandbox"
          className="inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400"
        >
          Back to hub
        </Link>
      </div>
    );
  }

  return (
    <PartnerApiDocsClient
      toc={[...PARTNER_DOCS_TOC]}
      cancelReasonCodes={[...CANCEL_REASON_CODES]}
      defaultEnvironment="sandbox"
    />
  );
}
