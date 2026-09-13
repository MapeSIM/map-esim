import type { Metadata } from "next";
import LegalDocument from "@/app/components/legal/LegalDocument";
import { BRAND_NAME, BRAND_SITE_HOST } from "@/app/lib/brand";
import { LEGAL_CONTACTS, type LegalSection } from "@/app/lib/legal";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

export const metadata: Metadata = {
  title: `Terms & Conditions | ${BRAND_NAME}`,
  description: `Terms of use for ${BRAND_NAME} websites, customer accounts, Partner services, shared eSIM links and digital eSIM products.`,
  alternates: { canonical: absoluteCanonical("/terms-and-conditions") },
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement to Terms",
    paragraphs: [
      `These Terms & Conditions (“Terms”) govern your use of ${BRAND_NAME} services offered through ${BRAND_SITE_HOST}. They apply to website visitors, customer accounts, eSIM customers, Partner / reseller accounts, and people who open a shared eSIM link.`,
      `By visiting ${BRAND_SITE_HOST}, creating an account, purchasing an eSIM, using Partner services, or opening a shared eSIM link, you accept these Terms and our Privacy Policy. If you do not agree, do not use the services.`,
    ],
  },
  {
    id: "eligibility-accounts",
    title: "Eligibility and Accounts",
    paragraphs: [
      "You must be able to form a binding contract under applicable law to use our services. Provide accurate information, keep account details current, and safeguard your login credentials.",
    ],
    bullets: [
      "Customer accounts: you are responsible for the accuracy of the information you submit and for activity that occurs under your account, unless you have told us of unauthorized use and we have had a reasonable opportunity to respond.",
      "Account security: choose a strong unique password, do not share one-time verification codes, and contact support promptly if you suspect unauthorized access.",
      "Email verification and other security checks may be required before certain account features can be used. We may send verification codes, password-change alerts and security notices to your registered email address.",
      "Authentication: you may sign in with email and password. Google Sign-In may also be available. When you use Google Sign-In, Google authenticates you; we do not receive or store your Google password.",
      "Partner accounts: Partner / reseller access is separate from a customer account. Partners are responsible for activity under their Partner account, including orders, branding, shared links and wallet use where those features are enabled.",
    ],
  },
  {
    id: "services",
    title: "MAP eSIM Services",
    paragraphs: [
      `${BRAND_NAME} is a web-based service. We provide digital eSIM connectivity products and related account tools through ${BRAND_SITE_HOST}.`,
    ],
    bullets: [
      "Digital eSIM connectivity products for destinations and plans shown on the website",
      "Customer account services, including orders, installation access, wallet or account credits, Rewards where available, and support",
      "Partner portal services for authorized Partner / reseller accounts",
      "Shared eSIM links that can let a recipient view installation details without a MAP eSIM login",
      "Installation support through account access, protected order pages, shared links and service emails where applicable",
    ],
  },
  {
    id: "digital-products",
    title: "Digital eSIM Products",
    paragraphs: [
      `${BRAND_NAME} sells digital eSIM products. The attributes that apply to your purchase are those confirmed for the selected offer at checkout, which typically include:`,
    ],
    bullets: [
      "Destination or coverage scope",
      "Data allowance",
      "Validity period",
      "SMS and voice only where that capability is shown for the selected plan at checkout",
      "Add More Data on an existing eSIM only where that option is available for the relevant order",
    ],
    callout:
      "eSIM products are digital goods. Delivery is electronic. Once installation credentials have been issued, cancellation and refund options may be limited.",
  },
  {
    id: "device-compatibility",
    title: "Device Compatibility",
    paragraphs: [
      "eSIM products require a device that supports eSIM technology and, where the device is carrier-locked, an unlocked device that can use a third-party eSIM profile.",
      "You are responsible for checking device and network compatibility before purchase. Manufacturer documentation or your primary carrier can help you confirm whether your device supports eSIM and the relevant networks.",
      `${BRAND_NAME} does not guarantee that every device, browser, operating-system version or network combination will install or connect successfully.`,
    ],
  },
  {
    id: "delivery-installation",
    title: "Delivery, Smart Install and Installation",
    paragraphs: [
      "After a successful order, installation details are delivered electronically through one or more of the following, depending on how the order was placed: signed-in account access for the customer or Partner who owns the order; protected order access associated with the purchase; and email to the address associated with the order, where that delivery option applies.",
      "Smart Install may be offered so a supported device can start installation from the website. It is available only on supported devices and browsers. If Smart Install is not available or does not complete, other installation methods remain available.",
      "Depending on the order and your device, installation may use a QR code, manual installation steps, an SM-DP+ address and an activation code.",
      "QR codes, LPA information, SM-DP+ addresses and activation codes are sensitive operational data. Keep them confidential. Do not post them publicly or send them through untrusted channels. Installation, network registration and ongoing connectivity still depend on your device, local networks and third-party carrier systems.",
    ],
  },
  {
    id: "shared-esim-links",
    title: "Shared eSIM Links",
    paragraphs: [
      "A shared eSIM link may allow a recipient to view installation details and install an eSIM without creating a MAP eSIM account. Partner or customer branding may appear on a shared page, such as a name, logo, colours or support details.",
      "The person who creates or sends a shared link is responsible for keeping that link secure and for sharing it only with the intended recipient. Anyone who has the link may be able to view the installation details it unlocks.",
      "A shared-link recipient is not the original purchaser. Opening a shared link does not create a customer or Partner account, does not grant wallet access, does not grant Rewards, and does not allow the recipient to request a refund as the purchaser.",
    ],
  },
  {
    id: "partner-services",
    title: "Partner / Reseller Services",
    paragraphs: [
      `Authorized ${BRAND_NAME} Partners may resell eSIM products through the Partner portal under these Terms and any Partner-specific rules we provide. Partner services may include:`,
    ],
    bullets: [
      "Partner portal access to place and manage Partner orders",
      "Partner branding used on shared eSIM pages",
      "Partner order and installation management",
      "Partner wallet or account credits where those features are enabled for the Partner account",
    ],
    callout:
      "General customers may not resell, redistribute or commercially exploit eSIM products without our prior permission. Authorized Partner / reseller activity is the permitted exception.",
  },
  {
    id: "coverage-availability",
    title: "Coverage and Network Availability",
    paragraphs: [
      "Mobile connectivity is provided through third-party eSIM and network providers. Coverage, speeds and availability vary by destination, local network conditions, congestion, device settings and regulation.",
      `${BRAND_NAME} does not guarantee that service will be available in every location, at every time, or at any particular speed. Temporary outages, roaming limits and carrier-side restrictions may occur. We do not operate the underlying mobile carrier networks.`,
    ],
  },
  {
    id: "fair-use",
    title: "Fair Use Policy",
    paragraphs: [
      `You agree to use ${BRAND_NAME} and eSIM products lawfully and fairly. You must not:`,
    ],
    bullets: [
      "Commit fraud, including false refund, chargeback or identity claims",
      "Abuse the website, accounts, wallets, Rewards, Partner tools or installation services",
      "Share unauthorized credentials, including login details, one-time codes, QR codes, SM-DP+ addresses or activation codes",
      "Attempt to bypass security controls, rate limits, protected order access or shared-link authorization",
      "Use the service for unlawful, harmful or infringing activity",
    ],
  },
  {
    id: "pricing-payments",
    title: "Pricing, Payments and Taxes",
    paragraphs: [
      "The price, currency and any displayed conversion shown at checkout apply to your confirmed order. The amount authorized at payment is the amount applicable to that order.",
      "Taxes, fees or currency-conversion differences may apply depending on your location, payment method and the rules of the payment provider. By submitting payment, you authorize the charge through the payment process presented at checkout.",
      `${BRAND_NAME} does not store complete payment card numbers on its own systems. External payment providers may process payments and handle card or payment credentials under their own terms.`,
      "Failed payments may prevent fulfilment. Chargebacks or payment disputes may result in suspension of affected services while we investigate.",
    ],
  },
  {
    id: "wallet-credits",
    title: "Wallet / Account Credits",
    paragraphs: [
      `${BRAND_NAME} may provide a wallet or account credit that can be used for eligible purchases on ${BRAND_SITE_HOST}. Wallet credits are a stored account balance for use on our platform.`,
      "Wallet credits are not a bank account, payment account or cash equivalent, and they earn no interest. They are not redeemable for cash unless applicable law requires that result.",
      "If a purchase fails after wallet funds were reserved, a confirmed failure may release or reverse that reservation. That reversal is not a card or payment-provider refund.",
    ],
  },
  {
    id: "rewards",
    title: "Rewards",
    paragraphs: [
      `${BRAND_NAME} may operate Rewards for eligible customer purchases. Rewards are a customer-account benefit. Eligible purchases may earn reward points, which are stored on the customer account and may be redeemed at checkout when that option is shown.`,
      "Rewards have no cash value and are not transferable except where required by law. Earning rates, redemption thresholds and availability may change; the values shown before you redeem apply to that redemption.",
      "If a refund is approved and processed, reward points earned on that order may be adjusted or removed, and points redeemed on that order may be restored where the records allow. A Rewards balance is not reduced below zero by that adjustment.",
    ],
  },
  {
    id: "refunds-cancellation",
    title: "Refunds and Cancellation",
    paragraphs: [
      "Because eSIM products are digital goods delivered electronically, cancellation after fulfilment or after installation credentials have been issued may be limited. Installed or activated eSIMs are not described as always refundable.",
      "Refund requests generally must be submitted within 7 days of purchase. Signed-in customers may submit a request from Account → Orders, or contact support with an order reference. Submitting a request starts a review; it is not itself a completed refund.",
      "Requests are reviewed before approval. If a request is approved, the refund is normally issued as MAP eSIM Wallet Credit after it is processed. In exceptional cases, a refund may be returned to the original payment method where that is required by law or separately approved and supported by the payment provider.",
      "Partner refund requests follow Partner processes in the Partner portal or the Partner support path we provide. Shared-link recipients cannot request a refund as the purchaser.",
      "See our Refund Policy for more detail. Outcomes depend on the facts of the case, provider constraints and applicable law.",
    ],
  },
  {
    id: "third-party-providers",
    title: "Third-party Providers",
    paragraphs: [
      `${BRAND_NAME} relies on independent service providers to operate the platform. Those parties may include:`,
    ],
    bullets: [
      "eSIM connectivity providers that provision profiles and access to mobile networks",
      "External payment providers that process checkout and related payment operations",
      "Hosting, email and security providers that help operate the website and protect accounts",
    ],
    callout: `${BRAND_NAME} is not the underlying mobile carrier. Delivery, coverage and service quality can be affected by third-party systems outside our reasonable control.`,
  },
  {
    id: "support",
    title: "Support and Communications",
    paragraphs: [
      `For account, order or installation questions, contact ${LEGAL_CONTACTS.support}. Optional live chat may be available on selected public pages where cookie consent allows it.`,
      "Support is provided through the channels we make available from time to time. We do not promise a specific response time, availability window or outcome. Do not send passwords, full payment details, QR images, ICCIDs, SM-DP+ addresses or activation codes by email or chat.",
    ],
  },
  {
    id: "suspension-termination",
    title: "Suspension and Termination",
    paragraphs: [
      `${BRAND_NAME} may restrict, suspend or terminate access to accounts, shared links or services where reasonably necessary to address:`,
    ],
    bullets: [
      "Fraud or suspected fraud",
      "Abuse of the website, accounts, wallets, Rewards, Partner tools or installation services",
      "Security issues, including unauthorized access or credential sharing",
      "Legal requirements or a material breach of these Terms",
    ],
    callout:
      "You may delete a customer account through available account controls, subject to retention of order and related records as described in our Privacy Policy.",
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    paragraphs: [
      `The ${BRAND_NAME} name, logos, website design, text and related materials are protected by applicable intellectual property laws. You may not copy, modify or distribute our branding or site content except as we expressly permit.`,
      "Branding that a Partner uploads or submits (for example a company name, logo or support details) remains the Partner’s responsibility. We may use that branding solely to operate Partner services and shared eSIM pages. Partners must have the rights needed to upload that content and must not upload material that infringes someone else’s rights.",
    ],
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    paragraphs: [
      `${BRAND_NAME} does not guarantee uninterrupted, error-free or continuous connectivity. We are not responsible for incompatible devices, carrier-locked phones, unsupported browsers, or network conditions controlled by third-party providers.`,
      `To the extent permitted by applicable law, ${BRAND_NAME} is not liable for indirect, incidental, special, consequential or punitive damages, or for loss of profits, data, goodwill or business opportunities arising from use of the website, accounts, Partner services, shared eSIM links or eSIM products.`,
      "Our aggregate liability for claims relating to a specific order is limited to the amount you paid for that order. Nothing in these Terms limits any non-waivable consumer rights that apply to you, including liability that cannot be excluded for death or personal injury caused by negligence, or for fraud.",
    ],
  },
  {
    id: "indemnification",
    title: "Indemnification",
    paragraphs: [
      `You agree to indemnify and hold ${BRAND_NAME} harmless from claims, losses, damages, liabilities and reasonable expenses (including legal fees) arising from:`,
    ],
    bullets: [
      "Illegal or unauthorized use of the website, accounts or eSIM products",
      "Misuse or unauthorized sharing of login credentials or installation data",
      "Unauthorized resale or commercial exploitation of eSIM products",
      "Partner branding, support details or other content a Partner uploads or asks us to display",
    ],
  },
  {
    id: "governing-law",
    title: "Governing Law",
    paragraphs: [
      `These Terms are governed by the laws of Pakistan. ${BRAND_NAME} operates from Pakistan. Nothing in this section limits any non-waivable consumer protections that may apply to you under mandatory local law.`,
    ],
  },
  {
    id: "changes",
    title: "Changes to Terms",
    paragraphs: [
      `We may update these Terms from time to time. When we publish a revision, the “Last updated” date on this page may change. Please review this page periodically when using ${BRAND_SITE_HOST}.`,
      "If a change is material, we may also provide a notice through the website or an account or service message where appropriate. Continued use of the services after updated Terms are published constitutes acceptance of the revised Terms.",
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
      summary={`These Terms govern use of ${BRAND_NAME} websites, customer accounts, Partner services, shared eSIM links and digital eSIM products.`}
      sections={sections}
    />
  );
}
