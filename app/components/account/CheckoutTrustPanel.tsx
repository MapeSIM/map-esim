import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { HOME_TRUST_ITEMS } from "@/app/lib/home/homeTrustSection";

const CHECKOUT_TRUST_TITLES = [
  "Instant QR Delivery",
  "No Physical SIM Required",
  "Verified Payments",
  "Support Available",
] as const;

const CHECKOUT_TRUST_ITEMS = HOME_TRUST_ITEMS.filter((item) =>
  (CHECKOUT_TRUST_TITLES as readonly string[]).includes(item.title)
);

function trustItemHref(title: string): string | null {
  if (title === "Support Available") return "/support";
  return null;
}

/** Compact checkout trust strip — titles only to reduce scroll under the Pay CTA. */
export function CheckoutTrustPanel() {
  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 sm:px-5"
      aria-labelledby="checkout-trust-heading"
    >
      <h2
        id="checkout-trust-heading"
        className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
      >
        Why travelers choose MAP eSIM
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CHECKOUT_TRUST_ITEMS.map((item) => {
          const href = trustItemHref(item.title);
          return (
            <li key={item.title} className="flex items-center gap-2">
              <CheckCircle2
                className="h-3.5 w-3.5 shrink-0 text-[var(--accent-strong)]"
                aria-hidden="true"
              />
              {href ? (
                <Link
                  href={href}
                  className="text-xs font-semibold leading-snug text-[var(--heading)] underline-offset-2 hover:underline sm:text-sm"
                >
                  {item.title}
                </Link>
              ) : (
                <p className="text-xs font-semibold leading-snug text-[var(--heading)] sm:text-sm">
                  {item.title}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
