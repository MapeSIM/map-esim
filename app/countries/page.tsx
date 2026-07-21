"use client";

import { useState } from "react";
import Link from "next/link";
import { countries } from "../data/countries";


export default function CountriesPage(){

const [search,setSearch] = useState("");
const [filter,setFilter] = useState("All");


const filteredCountries = countries.filter((item)=>{

const searchMatch =
item.name
.toLowerCase()
.includes(search.toLowerCase());


const filterMatch =
filter==="All" || item.region===filter;


return searchMatch && filterMatch;

});



return (

<main className="
min-h-screen
bg-[#020617]
text-white
px-6
py-16
">


<section className="
max-w-6xl
mx-auto
text-center
">


<p className="
text-lime-400
font-bold
">
🌍 MAP-eSIM Destinations
</p>


<h1 className="
text-5xl
font-bold
mt-5
">
eSIM for 220+ Destinations
</h1>


<p className="
text-gray-400
mt-4
">
Stay connected anywhere in the world.
</p>



<input

value={search}

onChange={(e)=>setSearch(e.target.value)}

placeholder="Search destinations..."

className="
mt-10
w-full
max-w-xl
p-5
rounded-2xl
text-black
bg-white
"

/>


</section>




{/* FILTERS */}


<div className="
flex
justify-center
gap-4
flex-wrap
mt-10
">


{["All","Popular","Regional","Global"].map((item)=>(


<button

key={item}

onClick={()=>setFilter(item)}

className={`
px-7
py-3
rounded-xl
font-bold
transition

${
filter===item
?
"bg-lime-400 text-black"
:
"bg-[#08263d]"
}

`}

>


{item==="Popular" && "🔥 "}
{item==="Regional" && "🌎 "}
{item==="Global" && "🚀 "}
{item==="All" && "🌐 "}


{item}


</button>


))}


</div>





{/* COUNTRIES */}


<section className="
max-w-6xl
mx-auto
mt-16
">


<h2 className="
text-3xl
font-bold
mb-8
">

Explore Countries

</h2>



<div className="
grid
md:grid-cols-3
gap-6
">


{filteredCountries.map((country)=>(


<div

key={country.id}

className="
bg-[#08263d]
border
border-[#16445f]
rounded-3xl
p-6
hover:border-lime-400
transition
"


>


<div className="
flex
justify-between
items-start
">


<div>

<div className="
text-5xl
">
{country.flag}
</div>


<h3 className="
text-2xl
font-bold
mt-4
">
{country.name}
</h3>


<p className="
text-gray-400
">
{country.plans} available
</p>


</div>



<span className="
bg-lime-400
text-black
px-3
py-1
rounded-full
text-sm
font-bold
">

{country.region}

</span>


</div>





<div className="
flex
justify-between
items-center
mt-8
">


<div>

<p className="
text-gray-400
text-sm
">
Starting from
</p>


<p className="
text-lime-400
text-2xl
font-bold
">
{country.startingPrice}
</p>


</div>



<Link

href={`/countries/${country.id}`}

className="
bg-lime-400
text-black
px-5
py-3
rounded-xl
font-bold
"

>

→

</Link>


</div>



</div>


))}


</div>


</section>



</main>

)

}