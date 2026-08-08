import type { Metadata } from "next";
import LegalDocument from "@/app/components/legal/LegalDocument";
import { BRAND_NAME, BRAND_SITE_HOST } from "@/app/lib/brand";
import { LEGAL_CONTACTS, type LegalSection } from "@/app/lib/legal";

export const metadata: Metadata = {
  title: `Terms & Conditions | ${BRAND_NAME}`,
  description: `Terms of use for ${BRAND_NAME} accounts, eSIM purchases and related services.`,
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement to these terms",
    paragraphs: [
      `These Terms & Conditions (“Terms”) govern your use of ${BRAND_NAME} websites, customer accounts and digital eSIM products offered via ${BRAND_SITE_HOST}. By creating an account, placing an order or using our services, you agree to these Terms.`,
    ],
  },
  {
    id: "eligibility",
    title: "Eligibility and account responsibilities",
    paragraphs: [
      "You must be able to form a binding contract under applicable law to use our services. You are responsible for providing accurate information, keeping your account details current, and safeguarding your login credentials.",
      "Email verification may be required before you can use certain account features. You are responsible for activity that occurs under your account unless you have told us of unauthorized use and we have had a reasonable opportunity to respond.",
    ],
  },
  {
    id: "account-security",
    title: "Account security",
    paragraphs: [
      "Choose a strong unique password and do not share one-time verification codes. We may send security notices, password-change alerts and verification codes to your registered email address. If you suspect unauthorized access, change your password and contact support promptly.",
    ],
  },
  {
    id: "digital-products",
    title: "Digital eSIM products",
    paragraphs: [
      `${BRAND_NAME} sells digital eSIM connectivity products. Plans typically include a destination or coverage scope, a data allowance and a validity period as shown at checkout. Exact plan attributes are those confirmed for the selected offer at the time of purchase.`,
      "eSIM products are fulfilled through a third-party eSIM provider and rely on third-party mobile networks. We do not operate every underlying carrier network.",
    ],
  },
  {
    id: "compatibility",
    title: "Device compatibility",
    paragraphs: [
      "eSIM plans require an unlocked, eSIM-capable device that supports the relevant networks for your destination. Carrier-locked phones, incompatible devices and unsupported configurations may prevent installation or service.",
      "You are responsible for verifying device and network compatibility before purchase. If you are unsure, check your device manufacturer documentation or contact your primary carrier.",
    ],
  },
  {
    id: "delivery-installation",
    title: "Delivery, installation and activation",
    paragraphs: [
      "After a successful order, installation details are delivered by email and/or through protected order access associated with your purchase. Follow the installation instructions provided for your device.",
      "Activation, network registration and ongoing connectivity depend on device settings, local network conditions and third-party carrier systems. Keep installation credentials confidential and store QR or activation details securely.",
    ],
  },
  {
    id: "coverage-networks",
    title: "Coverage, validity and network limitations",
    paragraphs: [
      "Plan validity, data allowance and destination coverage are described in the offer details presented before purchase. Actual speeds, coverage and availability can vary based on third-party networks, congestion, local regulations and device conditions.",
      `${BRAND_NAME} does not guarantee uninterrupted, error-free or continuous service. Temporary outages, roaming limitations and carrier-side restrictions may occur.`,
    ],
  },
  {
    id: "acceptable-use",
    title: "Fair and lawful use",
    paragraphs: [
      "You agree to use eSIM products and our website lawfully and fairly. You must not:",
    ],
    bullets: [
      "Resell, redistribute or commercially exploit plans without our prior written permission",
      "Engage in fraud, abuse, unauthorized access or interference with our systems or providers",
      "Use the service for unlawful, harmful or infringing activity",
      "Attempt to bypass security controls, rate limits or protected installation access",
    ],
  },
  {
    id: "pricing-payment",
    title: "Pricing, taxes and payment",
    paragraphs: [
      "Prices, currencies and any displayed conversions are shown for convenience during browsing and checkout. The amount authorized at payment is the amount applicable to your confirmed order.",
      "Taxes, fees or currency conversion differences may apply depending on your location, payment method and provider rules. By submitting payment, you authorize the applicable charge through the payment process presented at checkout.",
      "Failed payments may prevent fulfilment. Chargebacks or payment disputes may result in suspension of affected services while we investigate.",
    ],
    callout:
      "Payments are processed by an external payment provider. Card details and payment credentials are handled by that provider under its own terms.",
  },
  {
    id: "cancellation-refunds",
    title: "Cancellation and refunds",
    paragraphs: [
      "eSIM products are digital goods. Once an order has been fulfilled or installation credentials have been issued, cancellation and refund options may be limited.",
      `${BRAND_NAME} does not promise automatic refunds. Activated or installed eSIMs are not described as always refundable. Where a refund review may be considered — for example a confirmed non-delivery, duplicate charge or clear fulfilment failure — contact support with your order reference. Outcomes depend on the facts of the case, provider constraints and applicable law.`,
    ],
  },
  {
    id: "third-parties",
    title: "Third-party providers and networks",
    paragraphs: [
      "Order provisioning depends on our third-party eSIM provider and underlying mobile networks. Those parties’ systems, coverage and policies can affect delivery and service quality. We are not responsible for every act or omission of independent carriers or providers outside our reasonable control.",
    ],
  },
  {
    id: "suspension",
    title: "Suspension or termination",
    paragraphs: [
      "We may suspend or terminate access to accounts or services where reasonably necessary to address security risk, fraud, prohibited use, legal requirements or material breach of these Terms. You may delete your customer account through available account controls, subject to retention of historical order records as described in our Privacy Policy.",
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    paragraphs: [
      `The ${BRAND_NAME} name, logos, website design, text and related materials are protected by applicable intellectual property laws. You may not copy, modify or distribute our branding or site content except as expressly permitted.`,
    ],
  },
  {
    id: "liability",
    title: "Limitation of liability",
    paragraphs: [
      `To the extent permitted by applicable law, ${BRAND_NAME} is not liable for indirect, incidental, special, consequential or punitive damages, or for loss of profits, data, goodwill or business opportunities arising from use of the website, accounts or eSIM products.`,
      "Our aggregate liability for claims relating to a specific order is limited to the amount you paid for that order, except where liability cannot be limited under applicable law (including liability for death or personal injury caused by negligence, or fraud).",
    ],
  },
  {
    id: "governing-law",
    title: "Governing law",
    paragraphs: [
      `These Terms are governed by the laws of Pakistan. ${BRAND_NAME} operates from Pakistan. Nothing in this section limits any non-waivable consumer protections that may apply to you under mandatory local law.`,
    ],
  },
  {
    id: "updates",
    title: "Changes to these terms",
    paragraphs: [
      "We may update these Terms from time to time. The “Last updated” date will change when revisions are published. Material changes may also be communicated through the website or account notices where appropriate.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: ["For legal or support questions about these Terms, contact:"],
    bullets: [
      `Legal: ${LEGAL_CONTACTS.legal}`,
      `Support: ${LEGAL_CONTACTS.support}`,
    ],
  },
];

export default function TermsAndConditionsPage() {
  return (
    <LegalDocument
      title="Terms & Conditions"
      summary={`These Terms govern use of ${BRAND_NAME} accounts, digital eSIM products and related services.`}
      sections={sections}
    />
  );
}
