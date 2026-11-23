import { redirect } from "next/navigation";

/** Legacy path → docs (playground remains at /sandbox/api-playground). */
export default function SandboxApiLegacyRedirect() {
  redirect("/sandbox/docs");
}
