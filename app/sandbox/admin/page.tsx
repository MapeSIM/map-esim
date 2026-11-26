import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRole } from "@/app/lib/auth/session";
import { signOutAction } from "@/app/lib/auth/actions";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";
import { getGlobalSandboxApiEnabled } from "@/app/lib/sandbox/sandboxApiControls";
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

  const [partners, globalSandboxApiEnabled] = await Promise.all([
    listSandboxPartners(),
    getGlobalSandboxApiEnabled(),
  ]);

  return (
    <div className="min-h-screen w-full bg-[#070D19] px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
              mapesim.store
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">
              Sandbox Admin
            </h1>
            <p className="text-sm text-slate-400">
              Create and manage isolated Neon sandbox partners. Live{" "}
              <code className="text-slate-300">PartnerProfile</code> rows are
              never touched. Signed in as {admin.email}.
            </p>
            <p className="pt-1 text-xs text-slate-500">
              <Link
                href="/sandbox"
                className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
              >
                ← Sandbox hub
              </Link>
            </p>
          </div>
          <form action={signOutAction} className="shrink-0">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.12] bg-transparent px-4 text-sm font-semibold text-slate-100 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-100"
            >
              Log out
            </button>
          </form>
        </header>
        <SandboxAdminPanel
          initialPartners={partners}
          globalSandboxApiEnabled={globalSandboxApiEnabled}
        />
      </div>
    </div>
  );
}
