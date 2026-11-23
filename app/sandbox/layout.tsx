import type { Metadata } from "next";
import { headers } from "next/headers";
import SandboxSessionGate from "@/app/components/sandbox/SandboxSessionGate";
import SandboxPortalChrome from "@/app/components/sandbox/SandboxPortalChrome";

export const metadata: Metadata = {
  title: "MAP eSIM Partner",
  description: "MAP eSIM Partner portal",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SandboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const pathname = h.get("x-map-pathname") || "";
  // Sandbox admin panel uses Auth.js ADMIN — skip demo partner gate.
  if (pathname === "/sandbox/admin" || pathname.startsWith("/sandbox/admin/")) {
    return <>{children}</>;
  }

  return (
    <SandboxSessionGate>
      <div className="min-h-screen w-full bg-[#070D19] text-slate-100">
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#070D19]/90 backdrop-blur-md">
          <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6">
            <SandboxPortalChrome />
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </SandboxSessionGate>
  );
}
