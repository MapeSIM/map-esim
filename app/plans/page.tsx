"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Database, Globe2 } from "lucide-react";
import { useCurrency } from "@/app/components/currency/CurrencyProvider";
import { buildCheckoutHref } from "@/app/lib/plans/plan-utils";
import type { VesimOffer } from "@/app/lib/vesim/offers";

export default function PlansPage() {
  const [plans, setPlans] = useState<VesimOffer[]>([]);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    fetch("/api/vesim/offers?country=PK", {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        setPlans(data.offers || []);
      });
  }, []);

  return (
    <main
      className="
min-h-screen
bg-[var(--page-bg)]
text-[var(--heading)]
"
    >
      <section
        className="
px-6
py-20
text-center
"
      >
        <h1
          className="
text-5xl
font-bold
mb-4
text-[var(--heading)]
"
        >
          Choose Your eSIM Plan
        </h1>

        <p
          className="
text-[var(--text-muted)]
mb-4
"
        >
          Affordable plans for worldwide travel
        </p>
        <p className="mb-12 text-sm text-[var(--text-muted)]">
          Not sure your phone supports eSIM?{" "}
          <Link
            href="/device-compatibility"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Check device compatibility
          </Link>
          .
        </p>

        <div
          className="
grid
md:grid-cols-3
gap-6
max-w-6xl
mx-auto
"
        >
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="
bg-[var(--surface)]
rounded-3xl
p-8
border
border-[var(--border)]
shadow-[var(--shadow)]
"
            >
              <h2
                className="
text-2xl
font-bold
"
              >
                {plan.name}
              </h2>

              <p
                className="
text-4xl
font-bold
text-[var(--accent)]
mt-5
"
              >
                {formatPrice(plan.priceUSD)}
              </p>

              <div
                className="
mt-6
space-y-3
text-[var(--text)]
"
              >
                <p className="flex items-center justify-center gap-2">
                  <Database className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
                  {plan.dataFormatted}
                </p>

                <p className="flex items-center justify-center gap-2">
                  <Clock3 className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
                  {plan.durationDays} Days
                </p>

                <p className="flex items-center justify-center gap-2">
                  <Globe2 className="h-4 w-4 text-[var(--accent-soft)]" aria-hidden="true" />
                  Coverage details on checkout
                </p>
              </div>

              <Link
                href={buildCheckoutHref(plan, "PK")}
                className="
block
mt-8
bg-[var(--accent)]
text-[var(--accent-ink)]
py-4
rounded-xl
font-bold
hover:opacity-90
"
              >
                Buy Now
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
