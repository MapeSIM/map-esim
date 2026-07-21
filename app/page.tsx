import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";

export default function Home() {

  const stats = [
    {
      icon: "🌍",
      number: "220+",
      text: "Countries"
    },
    {
      icon: "📱",
      number: "1M+",
      text: "Users"
    },
    {
      icon: "⚡",
      number: "Instant",
      text: "Activation"
    },
    {
      icon: "🛡️",
      number: "24/7",
      text: "Support"
    }
  ];

  return (
    <main className="min-h-screen bg-[#020617] text-white">

      {/* HERO */}
      <section
        className="
        max-w-6xl
        mx-auto
        px-6
        py-16
        md:py-24
        text-center
        "
      >

        <div className="text-lime-400 font-semibold mb-5">
          🌍 MAP-eSIM
        </div>

        <h1
          className="
          text-3xl
          sm:text-5xl
          md:text-6xl
          font-bold
          leading-tight
          "
        >
          Travel Anywhere.
          <br />
          Stay Connected.
        </h1>

        <p
          className="
          mt-5
          text-gray-400
          text-sm
          md:text-xl
          max-w-3xl
          mx-auto
          "
        >
          Affordable eSIM plans for 220+ destinations worldwide.
        </p>


        <div
          className="
          mt-8
          flex
          flex-row
          justify-center
          items-center
          gap-3
          "
        >

          <Link
            href="/countries"
            className="
            bg-lime-400
            text-black
            px-6
            py-3
            rounded-xl
            font-bold
            "
          >
            Get eSIM →
          </Link>


          <Link
            href="/plans"
            className="
            border
            border-gray-500
            px-6
            py-3
            rounded-xl
            font-bold
            "
          >
            View Plans
          </Link>

        </div>

      </section>



      {/* STATS */}

      <section
        className="
        max-w-6xl
        mx-auto
        px-6
        grid
        grid-cols-2
        md:grid-cols-4
        gap-4
        pb-16
        "
      >

        {stats.map((item,index)=>(
          <div
            key={index}
            className="
            bg-[#062b3d]
            border
            border-cyan-900
            rounded-2xl
            p-5
            text-center
            "
          >

            <div className="text-2xl">
              {item.icon}
            </div>

            <h3
              className="
              text-lime-400
              text-2xl
              font-bold
              mt-3
              "
            >
              {item.number}
            </h3>

            <p className="text-gray-400 text-sm">
              {item.text}
            </p>

          </div>
        ))}

      </section>
      
      {/* WHY CHOOSE */}

      <section
        className="
        max-w-6xl
        mx-auto
        px-6
        py-12
        "
      >

        <h2 className="
        text-3xl
        font-bold
        text-center
        mb-10
        ">
          Why Choose MAP-eSIM?
        </h2>


        <div className="
        grid
        md:grid-cols-3
        gap-5
        ">

          {[
            "Instant eSIM activation",
            "Affordable global plans",
            "24/7 customer support"
          ].map((item,index)=>(
            <div
              key={index}
              className="
              bg-[#062b3d]
              rounded-xl
              p-6
              text-center
              border
              border-cyan-900
              "
            >
              <h3 className="text-lime-400 font-bold text-lg">
                {item}
              </h3>

              <p className="text-gray-400 mt-3 text-sm">
                Stay connected anywhere in the world without roaming hassle.
              </p>

            </div>
          ))}

        </div>

      </section>




      {/* FAQ */}

      <section
        className="
        max-w-4xl
        mx-auto
        px-6
        py-12
        "
      >

        <h2 className="
        text-3xl
        font-bold
        text-center
        mb-8
        ">
          FAQ
        </h2>


        <div className="space-y-4">

          {[
            "How quickly does eSIM activate?",
            "Can I use eSIM on iPhone and Android?",
            "Do you support worldwide destinations?"
          ].map((faq,index)=>(
            <div
              key={index}
              className="
              bg-[#062b3d]
              rounded-xl
              p-5
              "
            >
              {faq}
            </div>
          ))}

        </div>


      </section>



      {/* FOOTER */}

      <footer
        className="
        bg-[#062b3d]
        border-t
        border-cyan-900
        py-10
        px-6
        "
      >

        <div
          className="
          max-w-6xl
          mx-auto
          grid
          md:grid-cols-4
          gap-8
          "
        >

          <div>
            <h3 className="text-lime-400 text-2xl font-bold">
              🌍 MAP-eSIM
            </h3>

            <p className="text-gray-400 mt-3 text-sm">
              Stay connected anywhere in the world with fast eSIM plans.
            </p>
          </div>


          <div>
            <h4 className="font-bold mb-3">
              Company
            </h4>
            <p>About Us</p>
            <p>Blog</p>
            <p>Contact</p>
          </div>


          <div>
            <h4 className="font-bold mb-3">
              Destinations
            </h4>
            <p>Countries</p>
            <p>Popular Plans</p>
            <p>Global eSIM</p>
          </div>


          <div>
            <h4 className="font-bold mb-3">
              Support
            </h4>
            <p>Help Center</p>
            <p>FAQ</p>
            <p>24/7 Support</p>
          </div>


        </div>


        <div
          className="
          mt-8
          pt-5
          border-t
          border-gray-700
          text-center
          text-gray-400
          text-sm
          "
        >
          © 2026 MAP-eSIM. All rights reserved.
        </div>


      </footer>


    </main>
  );
}