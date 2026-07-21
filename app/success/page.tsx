"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

export default function SuccessPage() {
  return (
    <main className="min-h-screen bg-[#020617] text-white px-6 py-16">

      <section className="max-w-4xl mx-auto text-center">

        <div className="text-5xl mb-6">
          🎉
        </div>

        <h1 className="text-5xl font-bold">
          Payment Successful
        </h1>

        <p className="text-gray-400 mt-4 text-xl">
          Your eSIM is ready to activate
        </p>


        <div className="bg-[#003b52] rounded-3xl p-8 mt-12">

          <h2 className="text-3xl font-bold mb-8">
            Order Details
          </h2>


          <div className="bg-[#002b3d] rounded-2xl p-6 text-left space-y-5">

            <p>🌍 Country: <b>Pakistan PK</b></p>

            <p>📶 Data: <b>5GB</b></p>

            <p>⌛ Validity: <b>30 Days</b></p>

            <p>
              🆔 Order ID:
              <b className="text-lime-400">
                MAP-ESIM-58291
              </b>
            </p>

          </div>


          <h2 className="text-2xl font-bold mt-10">
            Scan QR Code To Install
          </h2>


          <div className="
            bg-white
            p-5
            w-52
            h-52
            rounded-3xl
            mx-auto
            mt-6
            flex
            items-center
            justify-center
          ">

            <QRCodeSVG
              value="LPA:1$esim.map-esim.com$ACTIVATION-CODE-58291"
              size={170}
            />

          </div>


          <p className="text-gray-400 mt-6">
            Open Phone Settings → Mobile Network → Add eSIM
          </p>
          <button
onClick={()=>{
alert("Open Settings → Cellular/Mobile Network → Add eSIM");
}}
className="
mt-6
bg-lime-400
text-black
px-8
py-3
rounded-xl
font-bold
"
>
Install eSIM Now →
</button>

          <Link
            href="/countries"
            className="
              inline-block
              mt-10
              bg-lime-400
              text-black
              px-8
              py-4
              rounded-xl
              font-bold
            "
          >
            Buy Another eSIM →
          </Link>


        </div>

      </section>

    </main>
  );
}