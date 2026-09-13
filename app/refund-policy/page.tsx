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
      `This Refund Policy explains how ${BRAND_NAME} handles refund reviews for digital eSIM products. It should be read together with our Terms & Conditions, especially the Refunds and Cancellation section.`,
      `${BRAND_NAME} does not promise automatic refunds. Submitting a request starts a review. It does not itself move funds or complete a refund.`,
    ],
  },
  {
    id: "digital-goods",
    title: "Digital eSIM products",
    paragraphs: [
      "eSIM products are digital goods delivered electronically. Once an order has been fulfilled or installation credentials have been issued, cancellation and refund options may be limited.",
      "Activated or installed eSIMs are not described as always refundable. Outcomes depend on the facts of the case, provider constraints and applicable law.",
    ],
  },
  {
    id: "request-window",
    title: "Refund request window",
    paragraphs: [
      "Refund requests generally must be submitted within 7 days of purchase, or within 7 days of the order becoming eligible for review.",
      "A request submitted after that window may still be reviewed in limited cases, but late requests are not guaranteed to be accepted.",
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
      "Refund rights belong to the original purchaser or account holder for that order.",
      "Signed-in customers may submit a refund review request from Account → Orders for the relevant purchase.",
      `You may also contact ${LEGAL_CONTACTS.support} with your order reference. Do not email passwords, full payment details, QR images, activation codes, ICCIDs, SM-DP+ addresses, or other installation secrets.`,
    ],
  },
  {
    id: "shared-esim",
    title: "Shared eSIM links",
    paragraphs: [
      "A person who opens a shared eSIM link is not the original purchaser. Shared-link recipients cannot request a refund as the purchaser and do not receive wallet or Rewards rights by opening the link.",
      "If a refund review is available, it must be requested by the original purchaser or account holder through their customer or Partner account.",
    ],
  },
  {
    id: "partner-refunds",
    title: "Partner / reseller refunds",
    paragraphs: [
      "Partner and reseller refund requests follow the applicable Partner processes, not the customer Account → Orders path.",
      "Authorized Partners may submit a request from the Partner portal for a Partner-owned order, or use the Partner support channels we provide. Partner outcomes are still a review, not an automatic refund.",
    ],
  },
  {
    id: "refund-process",
    title: "Refund process",
    paragraphs: [
      `A ${BRAND_NAME} refund follows these steps:`,
    ],
    bullets: [
      "A request is submitted by the original purchaser or Partner account holder",
      `${BRAND_NAME} reviews the request against the order, fulfilment records and these terms`,
      "An approval or rejection decision is recorded",
      "If approved, refund execution or processing happens as a separate step",
    ],
    callout:
      "Approval does not mean immediate payment movement. Funds move only after an approved refund is processed. Rejected reviews remain unpaid.",
  },
  {
    id: "refund-method",
    title: "Refund method",
    paragraphs: [
      "If a request is approved, the refund is normally processed as MAP Wallet Credit after it is executed.",
      "A refund to the original payment method is exceptional. It may be used where required by law or where MAP specifically approves that method and the payment provider supports it.",
      "Original-payment refunds are not an equal default option alongside wallet credit. This policy does not describe payment-provider timing, fees or settlement.",
    ],
  },
  {
    id: "wallet-and-payments",
    title: "Wallet reservation reversals",
    paragraphs: [
      "If a purchase fails after wallet funds were reserved, a confirmed failure may reverse that wallet reservation. That wallet reservation reversal is not a completed refund and is not a card or payment-provider refund.",
      "A refund review for a completed order is a separate process. Any funds movement for that review happens only if the request is approved and then processed.",
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
      summary={`This Refund Policy describes how ${BRAND_NAME} reviews refund requests for digital eSIM orders. A request is a review, not an automatic refund. Approved refunds are normally processed as MAP Wallet Credit.`}
      sections={sections}
    />
  );
}
