import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Profile moved to Account (API keys + branding). */
export default function PartnerProfileRedirectPage() {
  redirect("/partner/account");
}
