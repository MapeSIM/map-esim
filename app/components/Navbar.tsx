"use client";

import Link from "next/link";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";


export default function Navbar(){

const [open,setOpen] = useState(false);


return (

<nav className="
w-full
bg-[#020617]
border-b
border-[#123b5a]
text-white
px-6
py-5
">


<div className="
max-w-7xl
mx-auto
flex
justify-between
items-center
">


{/* LOGO */}

<Link
href="/"
className="
text-3xl
font-bold
text-lime-400
">

🌍 MAP-eSIM

</Link>



{/* DESKTOP */}

<div className="
hidden
md:flex
items-center
gap-8
font-medium
">


<Link
href="/"
className="
hover:text-lime-400
">

Home

</Link>


<Link
href="/countries"
className="
hover:text-lime-400
">

Destinations

</Link>


<Link
href="/plans"
className="
hover:text-lime-400
">

Plans

</Link>


<Link
href="/support"
className="
hover:text-lime-400
">

Support

</Link>



<ThemeToggle />



<Link
href="/countries"
className="
bg-lime-400
text-black
px-6
py-3
rounded-xl
font-bold
">

Get eSIM

</Link>



</div>





{/* MOBILE BUTTON */}

<button

onClick={()=>setOpen(!open)}

className="
md:hidden
text-3xl
"

>

☰

</button>


</div>





{/* MOBILE MENU */}

{

open && (

<div className="
md:hidden
mt-6
space-y-5
text-center
">


<Link href="/">
Home
</Link>


<Link href="/countries">
Destinations
</Link>


<Link href="/plans">
Plans
</Link>


<Link href="/support">
Support
</Link>



</div>

)

}



</nav>


)

}