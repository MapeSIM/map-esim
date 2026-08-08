import type { Metadata } from "next";

/** Thin legacy US offers listing — intentionally non-indexable (not a private auth route). */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EsimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
