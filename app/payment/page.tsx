"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";


export default function PaymentPage(){

const searchParams = useSearchParams();


const plan = searchParams.get("plan") || "Popular";

const data = searchParams.get("data") || "5GB";

const price = searchParams.get("price") || "10";

const validity = searchParams.get("validity") || "30 Days";



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
">

Secure Checkout 💳

</h1>


<p className="
text-gray-400
text-center
mt-4
">

Complete your eSIM purchase

</p>



<div className="
grid
md:grid-cols-2
gap-8
mt-12
">



{/* CUSTOMER */}


<div className="
bg-[#063047]
border
border-[#123b5a]
rounded-3xl
p-8
">


<h2 className="
text-2xl
font-bold
mb-6
">

Customer Details

</h2>


<input
placeholder="Full Name"
className="
w-full
bg-[#021d30]
p-4
rounded-xl
mb-4
outline-none
"
/>


<input
placeholder="Email Address"
className="
w-full
bg-[#021d30]
p-4
rounded-xl
mb-4
outline-none
"
/>


<input
placeholder="Phone Number"
className="
w-full
bg-[#021d30]
p-4
rounded-xl
outline-none
"
/>



</div>







{/* ORDER */}


<div className="
bg-[#063047]
border
border-[#123b5a]
rounded-3xl
p-8
">


<h2 className="
text-2xl
font-bold
mb-6
">

Order Summary

</h2>



<div className="
bg-[#021d30]
rounded-2xl
p-6
space-y-4
">


<p>
📦 Plan:
<b className="ml-2">
{plan}
</b>
</p>


<p>
📶 Data:
<b className="ml-2">
{data}
</b>
</p>


<p>
⏳ Validity:
<b className="ml-2">
{validity}
</b>
</p>


<div className="
border-t
border-gray-700
pt-4
text-3xl
font-bold
text-lime-400
">

${price}

</div>


</div>




<h3 className="
font-bold
text-xl
mt-8
">

Payment Method

</h3>



<div className="
grid
grid-cols-3
gap-3
mt-4
">


<div className="
bg-[#021d30]
p-4
rounded-xl
text-center
">

💳

</div>


<div className="
bg-[#021d30]
p-4
rounded-xl
text-center
">

🏦

</div>


<div className="
bg-[#021d30]
p-4
rounded-xl
text-center
">

📱

</div>


</div>



<Link

href="/success"

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

Pay Now →

</Link>



</div>



</div>


</section>


</main>

)

}