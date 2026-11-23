import PartnerPortalHomeCards, {
  SANDBOX_HOME_CARDS,
} from "@/app/components/partner/PartnerPortalHomeCards";

export default function SandboxHomePage() {
  return (
    <PartnerPortalHomeCards
      cards={SANDBOX_HOME_CARDS}
      eyebrow="MAP eSIM Partner"
      title="Welcome back"
      subtitle="Wholesale API Hub — docs, catalog, orders, wallet, and account in one dark-mode workspace."
    />
  );
}
