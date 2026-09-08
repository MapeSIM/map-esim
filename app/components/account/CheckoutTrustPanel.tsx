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

export function CheckoutTrustPanel() {
  return (
    <section
      className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
      aria-labelledby="checkout-trust-heading"
    >
      <h2
        id="checkout-trust-heading"
        className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
      >
        Why travelers choose MAP eSIM
      </h2>
      <ul className="mt-4 space-y-3">
        {CHECKOUT_TRUST_ITEMS.map((item) => {
          const href = trustItemHref(item.title);
          return (
            <li key={item.title} className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]"
                aria-hidden="true"
              />
              <div>
                {href ? (
                  <Link
                    href={href}
                    className="text-sm font-semibold text-[var(--heading)] underline-offset-2 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-[var(--heading)]">
                    {item.title}
                  </p>
                )}
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  {item.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
