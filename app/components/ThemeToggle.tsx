"use client";

import { useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  return (
    <button
      onClick={() => setDark(!dark)}
      className="px-4 py-2 rounded-lg bg-lime-400 text-black font-bold"
    >
      {dark ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}