"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CheckoutContent() {
  const searchParams = useSearchParams();

  const country = searchParams.get("country") || "Pakistan";
  const data = searchParams.get("data") || "3GB";
  const days = searchParams.get("days") || "15 Days";
  const price = searchParams.get("price") || "$7.99";

  return (
    <main className="min-h-screen bg-[#020617] text-white px-6 py-16">
      <section className="max-w-xl mx-auto">

        <h1 className="text-4xl font-bold text-center">
          Checkout
        </h1>

        <p className="text-gray-400 text-center mt-3">
          Complete your eSIM purchase
        </p>

        <div className="mt-10 bg-[#0f172a] rounded-2xl p-8">

          <h2 className="text-2xl font-bold">
            {country} eSIM
          </h2>

          <div className="mt-6 space-y-3 text-gray-300">
            <p>
              📡 Data: {data}
            </p>

            <p>
              ⏳ Validity: {days}
            </p>

            <p className="text-2xl font-bold text-white">
              💳 Price: {price}
            </p>
          </div>

          <button
            className="mt-8 w-full rounded-xl bg-green-500 text-black py-3 font-bold hover:bg-green-400"
          >
            Pay Now
          </button>

        </div>

      </section>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="text-white">Loading...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}