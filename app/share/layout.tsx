import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/lib/brand";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: BRAND_NAME,
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      nosnippet: true,
    },
  },
};

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen w-full max-w-full bg-[var(--page-bg)] px-3 py-8 text-[var(--heading)] sm:px-6 sm:py-10">
      <div className="mx-auto w-full min-w-0 max-w-lg">{children}</div>
    </main>
  );
}
