import type { Metadata } from "next";

/** Headers/noindex only — payment page business logic stays unchanged. */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function PaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
