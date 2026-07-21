"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function PaymentContent() {
  const searchParams = useSearchParams();

  const plan = searchParams.get("plan") || "Popular";
  const data = searchParams.get("data") || "5GB";
  const price = searchParams.get("price") || "10";
  const validity = searchParams.get("validity") || "30 Days";

  return (
    <main className="min-h-screen bg-[#020617] text-white px-6 py-16">
      <section className="max-w-xl mx-auto">

        <h1 className="text-5xl font-bold text-center">
          Secure Checkout 🔒
        </h1>

        <p className="text-gray-400 text-center mt-4">
          Complete your eSIM purchase
        </p>

        <div className="mt-12 bg-[#063047] border border-[#123b5a] rounded-3xl p-8">

          <h2 className="text-2xl font-bold mb-6">
            Order Summary
          </h2>

          <div className="space-y-3 text-gray-200">

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
              Price: <span className="font-bold">${price}</span>
            </p>

          </div>

          <button className="w-full mt-8 bg-white text-black py-4 rounded-xl font-bold">
            Pay Now
          </button>

        </div>


        <Link
          href="/plans"
          className="block text-center mt-8 text-gray-300 underline"
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