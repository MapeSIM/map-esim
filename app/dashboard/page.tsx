"use client";

import Link from "next/link";

export default function DashboardPage(){

  return (
    <main className="
    min-h-screen
    bg-[#020617]
    text-white
    px-6
    py-16
    ">

      <section className="max-w-5xl mx-auto">

        <h1 className="
        text-5xl
        font-bold
        text-center
        ">
          My eSIMs
        </h1>

        <p className="
        text-gray-400
        text-center
        mt-4
        ">
          Manage your purchased eSIM plans
        </p>


        <div className="
        mt-12
        bg-[#003b52]
        rounded-3xl
        p-8
        ">

          <h2 className="text-3xl font-bold">
            🇵🇰 Pakistan eSIM
          </h2>


          <div className="
          bg-[#002b3d]
          rounded-2xl
          p-6
          mt-6
          space-y-4
          ">

            <p>
              📶 Data:
              <b> 5GB</b>
            </p>

            <p>
              ⏳ Validity:
              <b> 30 Days</b>
            </p>

            <p>
              🆔 Order ID:
              <b className="text-lime-400">
                MAP-ESIM-58291
              </b>
            </p>

            <p>
              Status:
              <b className="text-lime-400">
                Active ✅
              </b>
            </p>


          </div>


          <Link
          href="/success"
          className="
          inline-block
          mt-8
          bg-lime-400
          text-black
          px-8
          py-3
          rounded-xl
          font-bold
          "
          >
            View QR Code →
          </Link>


        </div>


      </section>


    </main>
  );
}