import Link from "next/link";

export default function PlansPage(){

const plans = [
{
name:"Starter",
price:"5",
data:"1GB",
validity:"7 Days"
},
{
name:"Popular",
price:"10",
data:"5GB",
validity:"30 Days"
},
{
name:"Unlimited",
price:"18",
data:"10GB",
validity:"30 Days"
}
];


return(
<main className="min-h-screen bg-[#020617] text-white">

<section className="px-6 py-20 text-center">

<h1 className="text-5xl font-bold mb-4">
Choose Your eSIM Plan
</h1>

<p className="text-gray-400 mb-12">
Affordable plans for worldwide travel
</p>


<div className="
grid
md:grid-cols-3
gap-6
max-w-6xl
mx-auto
">


{plans.map((plan)=>(

<div
key={plan.name}
className="
bg-[#063047]
rounded-3xl
p-8
border
border-[#123b5a]
"
>

<h2 className="text-2xl font-bold">
{plan.name}
</h2>


<p className="
text-4xl
font-bold
text-lime-400
mt-5">
${plan.price}
</p>


<div className="mt-6 space-y-3">

<p>📶 {plan.data} Data</p>

<p>⏳ {plan.validity}</p>

<p>🌍 Global Coverage</p>

</div>


<Link

href={`/payment?plan=${plan.name}&data=${plan.data}&price=${plan.price}&validity=${plan.validity}`}

className="
block
mt-8
bg-lime-400
text-black
py-4
rounded-xl
font-bold
">

Buy Now →

</Link>


</div>

))}


</div>

</section>

</main>
)

}