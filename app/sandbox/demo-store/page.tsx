import { redirect } from "next/navigation";

/** Legacy path → catalog (sandbox buy flow). */
export default function SandboxDemoStoreLegacyRedirect() {
  redirect("/sandbox/catalog");
}
