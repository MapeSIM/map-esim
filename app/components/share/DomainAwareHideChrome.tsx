import { readAppDomain } from "@/app/lib/domain/readAppDomain";
import HideOnShare from "@/app/components/share/HideOnShare";

/** Server wrapper so partneresim.com / mapesim.store never flash retail chrome. */
export default async function DomainAwareHideChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const domain = await readAppDomain();
  return <HideOnShare domain={domain}>{children}</HideOnShare>;
}
