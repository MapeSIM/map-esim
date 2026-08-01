  "use client";

  import { Suspense } from "react";
  import { useSearchParams } from "next/navigation";
  import Link from "next/link";
  import { useCurrency } from "@/app/components/currency/CurrencyProvider";

  function PaymentContent() {
    const searchParams = useSearchParams();
    const { formatPrice } = useCurrency();

    const plan = searchParams.get("plan") || "Popular";
    const data = searchParams.get("data") || "5GB";
    const priceParam = searchParams.get("price") || "10";
    const priceUsd = Number(priceParam.replace(/[^0-9.]/g, ""));
    const validity = searchParams.get("validity") || "30 Days";

    return (
      <main className="min-h-screen bg-[var(--page-bg)] text-[var(--heading)] px-6 py-16">
        <section className="max-w-xl mx-auto">

          <h1 className="text-5xl font-bold text-center text-[var(--heading)]">
            Secure Checkout
          </h1>

          <p className="text-[var(--text-muted)] text-center mt-4">
            Complete your eSIM purchase
          </p>

          <div className="mt-12 bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 shadow-[var(--shadow)]">

            <h2 className="text-2xl font-bold mb-6 text-[var(--heading)]">
              Order Summary
            </h2>

            <div className="space-y-3 text-[var(--text)]">

              <p>
                Plan: <span className="font-bold">{plan}</span>
              </p>

              <p>
                Data: <span className="font-bold">{data}</span>
              </p>

              <p>
                Validity: <span className="font-bold">{validity}</span>
              </p>

              <p>
                Price:{" "}
                <span className="font-bold">
                  {formatPrice(Number.isFinite(priceUsd) ? priceUsd : null)}
                </span>
              </p>

            </div>

            <button className="w-full mt-8 bg-[var(--accent)] text-[var(--accent-ink)] py-4 rounded-xl font-bold">
              Pay Now
            </button>

          </div>


          <Link
            href="/plans"
            className="block text-center mt-8 text-[var(--text-muted)] underline"
          >
            Back to Plans
          </Link>

        </section>
      </main>
    );
  }


  export default function PaymentPage() {
    return (
      <Suspense fallback={<div>Loading...</div>}>
        <PaymentContent />
      </Suspense>
    );
  }