import Link from "next/link";
import { countries } from "../../data/countries";

export default async function CountryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {

  const { id } = await params;

  const country = countries.find(
    (item: any) =>
      item.id?.toString().toLowerCase() === id.toLowerCase() ||
      item.name?.toLowerCase() === id.toLowerCase()
  );


  if (!country) {
    return (
      <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center">
        <h1>Country not found</h1>
      </main>
    );
  }


  return (
    <main className="min-h-screen bg-[#020617] text-white px-6 py-16">

      <section className="max-w-3xl mx-auto text-center">

        <div className="text-5xl mb-5">
          🌍
        </div>

        <h1 className="text-4xl font-bold text-lime-400">
          {country.name} eSIM
        </h1>

        <p className="text-gray-400 mt-4">
          Stay connected anywhere in {country.name}.
        </p>


        <div className="mt-10 bg-[#063047] rounded-2xl p-8">

          <h2 className="text-2xl font-bold">
            eSIM Plan
          </h2>

          <p className="mt-4">
  📶 Data: {country.plans || "1GB"}
</p>

<p className="mt-2">
  ⏳ Validity: 30 Days
</p>

<p className="text-lime-400 text-3xl font-bold mt-4">
  ${country.startingPrice || "5"}
</p>
          <p className="text-lime-400 text-3xl font-bold mt-4">
            ${country.price || "5"}
          </p>


          <Link
            href="/checkout"
            className="inline-block mt-8 bg-lime-400 text-black px-8 py-3 rounded-xl font-bold"
          >
            Buy eSIM →
          </Link>

        </div>


        <Link
          href="/countries"
          className="inline-block mt-8 text-gray-400"
        >
          ← Back
        </Link>

      </section>

    </main>
  );
}