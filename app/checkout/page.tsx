"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function Checkout() {


const searchParams = useSearchParams();


const country = searchParams.get("country") || "Pakistan";

const data = searchParams.get("data") || "3GB";

const days = searchParams.get("days") || "15 Days";

const price = searchParams.get("price") || "$7.99";



return (

<main className="
min-h-screen
bg-[#020617]
text-white
px-6
py-16
">


<section className="
max-w-5xl
mx-auto
">


<h1 className="
text-5xl
font-bold
text-center
mb-12
">

Checkout 🛒

</h1>



<div className="
grid
md:grid-cols-2
gap-8
">



{/* CUSTOMER */}

<div className="
bg-[#08263d]
border
border-[#16445f]
rounded-3xl
p-8
">


<h2 className="
text-2xl
font-bold
mb-8
">

Customer Details

</h2>



<input

placeholder="Full Name"

className="
w-full
p-4
mb-5
rounded-xl
bg-white
text-black
"

/>


<input

placeholder="Email Address"

className="
w-full
p-4
mb-5
rounded-xl
bg-white
text-black
"

/>


<input

placeholder="Phone Number"

className="
w-full
p-4
rounded-xl
bg-white
text-black
"

/>


</div>





{/* SUMMARY */}

<div className="
bg-[#08263d]
border
border-[#16445f]
rounded-3xl
p-8
">


<h2 className="
text-2xl
font-bold
mb-8
">

Order Summary

</h2>



<div className="
bg-[#061b2d]
rounded-2xl
p-6
space-y-5
">



<div className="flex justify-between">

<span className="text-gray-400">
Country
</span>

<span>
🌍 {country}
</span>

</div>



<div className="flex justify-between">

<span className="text-gray-400">
Data
</span>

<span>
📶 {data}
</span>

</div>



<div className="flex justify-between">

<span className="text-gray-400">
Validity
</span>

<span>
⏳ {days}
</span>

</div>



<div className="
flex
justify-between
text-xl
font-bold
">


<span>
Price
</span>


<span className="
text-lime-400
">

{price}

</span>


</div>



</div>



<Link

href="/payment"

className="
block
text-center
mt-8
bg-lime-400
text-black
py-4
rounded-xl
font-bold
"

>

Continue Payment →

</Link>



</div>



</div>


</section>


</main>

)

}