import type { Metadata } from "next";
import LegalDocument from "@/app/components/legal/LegalDocument";
import { BRAND_NAME } from "@/app/lib/brand";
import { LEGAL_CONTACTS, type LegalSection } from "@/app/lib/legal";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

export const metadata: Metadata = {
  title: `Refund Policy | ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} reviews refund requests for digital eSIM orders.`,
  alternates: { canonical: absoluteCanonical("/refund-policy") },
};

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    paragraphs: [
      `This Refund Policy explains how ${BRAND_NAME} handles refund reviews for digital eSIM products. It should be read together with our Terms & Conditions, especially the cancellation and refunds section.`,
      `${BRAND_NAME} does not promise automatic refunds. Submitting a request starts a review. It does not itself move funds or complete a refund.`,
    ],
  },
  {
    id: "digital-goods",
    title: "Digital eSIM products",
    paragraphs: [
      "eSIM products are digital goods. Once an order has been fulfilled or installation credentials have been issued, cancellation and refund options may be limited.",
      "Activated or installed eSIMs are not described as always refundable. Outcomes depend on the facts of the case, provider constraints and applicable law.",
    ],
  },
  {
    id: "when-reviewed",
    title: "When a review may be considered",
    paragraphs: [
      "A refund review may be considered where there is, for example, a confirmed non-delivery, a duplicate charge, or a clear fulfilment failure.",
      "A review is not a guarantee of a refund. We may ask for your order reference and other non-sensitive details needed to investigate.",
    ],
  },
  {
    id: "how-to-request",
    title: "How to request a review",
    paragraphs: [
      "Signed-in customers may submit a refund review request from Account → Orders for the relevant purchase.",
      `You may also contact ${LEGAL_CONTACTS.support} with your order reference. Do not email passwords, full payment details, QR images, activation codes, ICCIDs, or other installation secrets.`,
    ],
  },
  {
    id: "wallet-and-payments",
    title: "Wallet reversals and payment refunds",
    paragraphs: [
      "If a purchase fails after wallet funds were reserved, a confirmed failure may reverse that wallet reservation. That wallet reversal is not a card or payment-provider refund.",
      "A refund review for a completed order is a separate process. Any funds movement happens only if a review is approved and then executed. This policy does not describe payment-provider timing, fees or settlement.",
    ],
  },
  {
    id: "after-you-submit",
    title: "After you submit",
    paragraphs: [
      "We review the request against the order, fulfilment records and applicable terms. You may receive a status update by email or in your account.",
      "Approved reviews are executed through the original payment or wallet path used for the order where that is possible. Rejected reviews remain unpaid.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: ["For refund-review questions, contact:"],
    bullets: [
      `Support: ${LEGAL_CONTACTS.support}`,
      `Billing: ${LEGAL_CONTACTS.billing}`,
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalDocument
      title="Refund Policy"
      summary={`This Refund Policy describes how ${BRAND_NAME} reviews refund requests for digital eSIM orders. A request is a review, not an automatic refund.`}
      sections={sections}
    />
  );
}
