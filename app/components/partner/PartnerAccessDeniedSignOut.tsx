"use client";

import { signOutAction } from "@/app/lib/auth/actions";

export default function PartnerAccessDeniedSignOut() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="text-sm font-semibold text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
      >
        Sign out of this account
      </button>
    </form>
  );
}
