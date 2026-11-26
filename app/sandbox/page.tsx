import { auth } from "@/auth";
import PartnerPortalHomeCards, {
  SANDBOX_ADMIN_CONSOLE_CARD,
  SANDBOX_HOME_CARDS,
} from "@/app/components/partner/PartnerPortalHomeCards";
import SandboxHubHeader from "@/app/components/sandbox/SandboxHubHeader";
import { getGlobalSandboxApiEnabled } from "@/app/lib/sandbox/sandboxApiControls";
import {
  SANDBOX_SESSION_COOKIE,
  getSandboxPartnerById,
  verifySandboxSession,
} from "@/app/lib/sandbox/sandboxPartnerDb";
import { cookies } from "next/headers";

export default async function SandboxHomePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const jar = await cookies();
  const partnerId = verifySandboxSession(
    jar.get(SANDBOX_SESSION_COOKIE)?.value
  );
  const partner = partnerId ? await getSandboxPartnerById(partnerId) : null;
  const globalApi = await getGlobalSandboxApiEnabled();
  const showApiDocs =
    Boolean(partner) &&
    globalApi &&
    partner?.apiEnabled !== false &&
    !partner?.disabledAt;

  const cards = [
    ...(isAdmin ? [SANDBOX_ADMIN_CONSOLE_CARD] : []),
    ...SANDBOX_HOME_CARDS.filter((card) => {
      if (card.href === "/sandbox/docs") return showApiDocs;
      return true;
    }),
  ];

  return (
    <div>
      {isAdmin ? (
        <SandboxHubHeader
          mode="admin"
          email={session?.user?.email ?? "admin"}
          name={session?.user?.name}
        />
      ) : partner ? (
        <SandboxHubHeader
          mode="partner"
          email={partner.email}
          name={partner.name}
        />
      ) : null}

      <PartnerPortalHomeCards
        cards={cards}
        eyebrow="MAP eSIM Partner"
        title={isAdmin ? "Sandbox control hub" : "Welcome back"}
        subtitle={
          isAdmin
            ? "Manage sandbox partners and API access, or open the partner demo workspace."
            : "Wholesale API Hub — docs, catalog, orders, wallet, and account in one dark-mode workspace."
        }
      />
    </div>
  );
}
