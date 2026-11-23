import { redirect } from "next/navigation";

/** Legacy path → demo store. */
export default function SandboxStorefrontLegacyRedirect() {
  redirect("/sandbox/demo-store");
}
