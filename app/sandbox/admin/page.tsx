import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRole } from "@/app/lib/auth/session";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";
import { listSandboxPartners } from "@/app/lib/sandbox/sandboxPartnerDb";
import {
  RETAIL_SITE_ORIGIN,
  isLocalDevHost,
} from "@/app/lib/domain/appDomain";
import SandboxAdminPanel from "@/app/components/sandbox/SandboxAdminPanel";

export const dynamic = "force-dynamic";

export default async function SandboxAdminPage() {
  const domain = await readAppDomain();
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";

  if (domain !== "sandbox" && !isLocalDevHost(host)) {
    redirect(`${RETAIL_SITE_ORIGIN}/admin`);
  }

  const admin = await requireRole("ADMIN", "/sandbox/admin");

  const partners = await listSandboxPartners();

  return (
    <div className="min-h-screen w-full bg-[#070D19] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
            mapesim.store
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Sandbox Admin
          </h1>
          <p className="text-sm text-slate-400">
            Create and manage isolated Neon sandbox partners. Live{" "}
            <code className="text-slate-300">PartnerProfile</code> rows are never
            touched. Signed in as {admin.email}.
          </p>
        </header>
        <SandboxAdminPanel initialPartners={partners} />
      </div>
    </div>
  );
}
