import PartnerApiDocsClient from "@/app/components/partner/PartnerApiDocsClient";
import { CANCEL_REASON_CODES } from "@/app/lib/partnerApiAuth";
import { PARTNER_DOCS_TOC } from "@/app/lib/partner/partnerApiDocsContent";

/**
 * Sandbox Partner API docs — same contract as production with environment
 * switcher defaulting to mapesim.store /api/sandbox/v1.
 */
export default function SandboxDocsPage() {
  return (
    <PartnerApiDocsClient
      toc={[...PARTNER_DOCS_TOC]}
      cancelReasonCodes={[...CANCEL_REASON_CODES]}
      defaultEnvironment="sandbox"
    />
  );
}
