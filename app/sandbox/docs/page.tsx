import PartnerApiDocsClient from "@/app/components/partner/PartnerApiDocsClient";
import {
  CANCEL_REASON_CODES,
} from "@/app/lib/partnerApiAuth";
import { PARTNER_DOCS_TOC } from "@/app/lib/partner/partnerApiDocsContent";

/**
 * Visual mirror of partner API docs. Downloads still point at live partner
 * doc routes when available; sandbox engine remains under /api/sandbox/v1.
 */
export default function SandboxDocsPage() {
  return (
    <PartnerApiDocsClient
      toc={[...PARTNER_DOCS_TOC]}
      cancelReasonCodes={[...CANCEL_REASON_CODES]}
    />
  );
}
