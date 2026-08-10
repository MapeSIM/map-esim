import type { Metadata } from "next";
import LegalDocument from "@/app/components/legal/LegalDocument";
import { BRAND_NAME, BRAND_SITE_HOST } from "@/app/lib/brand";
import { LEGAL_CONTACTS, type LegalSection } from "@/app/lib/legal";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

export const metadata: Metadata = {
  title: `Privacy Policy | ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} collects, uses and protects personal information.`,
  alternates: { canonical: absoluteCanonical("/privacy-policy") },
};

const sections: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    paragraphs: [
      `This Privacy Policy explains how ${BRAND_NAME} (“we”, “us”, “our”) handles personal information when you visit ${BRAND_SITE_HOST}, create an account, purchase an eSIM plan, or contact us.`,
      "This page is a professional draft prepared for business and legal review. It describes practices that apply to our customer accounts, security processes, order fulfilment through a third-party eSIM provider, and transactional email channels.",
    ],
  },
  {
    id: "information-you-provide",
    title: "Information you provide",
    paragraphs: [
      "Depending on how you use our services, you may provide:",
    ],
    bullets: [
      "Name and other profile details you choose to share",
      "Email address",
      "Account credentials (your password is stored only as a secure hash — we do not store your password in plain text)",
      "When you choose Google Sign-In: your Google email address, display name, profile image (when supplied by Google), and Google OAuth account identifier. We do not receive or store your Google password.",
      "Support messages and related correspondence",
      "Order information needed to fulfil a purchase (for example destination, plan selection and order references)",
    ],
  },
  {
    id: "automatically-collected",
    title: "Automatically collected information",
    paragraphs: [
      "When you use our website or account features, we may automatically collect limited technical and security-related information, such as:",
    ],
    bullets: [
      "IP address",
      "Browser and device information",
      "Security and activity logs related to authentication, account actions and abuse prevention",
      "Essential cookies needed for login, session continuity and security (see our Cookie Policy)",
    ],
  },
  {
    id: "account-security",
    title: "Account and security processing",
    paragraphs: [
      "We process personal information as needed to create and secure customer accounts, including:",
    ],
    bullets: [
      "Sending email-verification one-time codes (OTPs)",
      "Sending password-reset OTPs",
      "Sending password-change security alerts",
      "Sending account-deletion verification codes",
      "Storing passwords only as secure cryptographic hashes",
      "Offering Google Sign-In as an optional authentication method for account access and security",
      "Recording limited security events to help detect fraud, abuse or unauthorized access",
    ],
  },
  {
    id: "esim-orders",
    title: "eSIM order processing",
    paragraphs: [
      `${BRAND_NAME} offers digital eSIM connectivity products. To fulfil an order we process destination, plan and order details. Necessary information is shared with our third-party eSIM provider so the eSIM can be provisioned.`,
      "Installation information such as QR codes, LPA / activation data or related credentials is treated as sensitive operational data. Access is restricted to protected order channels (for example secure order links or authenticated account views where available). We do not use these details for marketing.",
    ],
  },
  {
    id: "payments",
    title: "Payment processing",
    callout:
      "Payments are processed by an external payment provider under that provider’s own terms and privacy notices.",
    paragraphs: [
      "Payments may be handled by an external payment provider. Card and payment credentials, if collected, are processed by that provider under its own terms and privacy notices.",
      `${BRAND_NAME} does not claim to store full payment card numbers on its own systems.`,
    ],
  },
  {
    id: "email-communications",
    title: "Email communications",
    paragraphs: [
      "We use dedicated transactional mailboxes for different types of messages:",
    ],
    bullets: [
      `${LEGAL_CONTACTS.security} — security notices and authentication codes`,
      `${LEGAL_CONTACTS.orders} — order and installation-related messages`,
      `${LEGAL_CONTACTS.billing} — billing-related notices when applicable`,
      `${LEGAL_CONTACTS.support} — customer support correspondence`,
    ],
  },
  {
    id: "how-we-use",
    title: "How we use information",
    paragraphs: ["We use personal information to:"],
    bullets: [
      "Provide, operate and improve the website and customer accounts",
      "Verify email addresses and protect accounts",
      "Fulfil eSIM orders and deliver installation information securely",
      "Communicate about orders, security events and support requests",
      "Detect, investigate and help prevent fraud, abuse and security incidents",
      "Meet legal, accounting and operational record-keeping needs",
    ],
  },
  {
    id: "sharing",
    title: "Sharing with service providers",
    paragraphs: [
      "We share personal information only as needed with service providers that help us operate the service, such as our third-party eSIM provider, email delivery infrastructure, hosting and security providers, an optional live-chat provider (Tawk.to) when you use chat after granting marketing cookie consent, and a payment provider once selected. We do not sell your personal information.",
      "When you use Google Sign-In, Google acts as an identity provider. Google authenticates you and returns limited account identity details so we can create or sign you into your MAP eSIM account. The purpose is account authentication, account security and helping prevent unauthorized access — not marketing.",
      "If you use optional live chat, the chat provider may process the messages and technical data needed to operate the widget. We do not automatically send your account email, order references, QR codes, ICCIDs, activation codes or payment details to the chat provider through the website integration.",
    ],
  },
  {
    id: "international",
    title: "International service providers",
    paragraphs: [
      `${BRAND_NAME} works with infrastructure and fulfilment partners that may process data in more than one country. Where information is processed internationally, we take reasonable steps appropriate to the nature of the service and applicable law.`,
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    paragraphs: [
      "We retain personal information only for as long as reasonably needed for the purposes described in this policy, including account administration, security, support, dispute handling and legal or accounting obligations.",
      "Some historical order and payment-related records may need to be retained even after an account is closed or deleted, for support, fraud prevention, accounting or legal reasons. Where feasible, account profile fields may be anonymized while preserving necessary operational records.",
    ],
  },
  {
    id: "security",
    title: "Security safeguards",
    paragraphs: [
      "We use technical and organizational safeguards appropriate to the sensitivity of the data we handle, including hashed password storage, restricted access to installation credentials, session controls and security logging. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    id: "account-deletion",
    title: "Account deletion and anonymization",
    paragraphs: [
      "Customers may request account deletion through the account security controls where available. When an account is deleted, we take steps to revoke sessions, disable password login, invalidate outstanding authentication codes and anonymize personal profile fields such as name and email so the original email can be used to register again if desired.",
      "Order history required for support, accounting or provider operations may be retained in a form that is no longer linked to an active customer login.",
    ],
  },
  {
    id: "your-rights",
    title: "Privacy rights",
    paragraphs: [
      "Depending on where you live, you may have rights under applicable privacy laws — for example to request access, correction, deletion, restriction or objection, or to withdraw consent where processing is consent-based. To exercise available rights, contact us using the privacy email below. We may need to verify your request before responding.",
    ],
  },
  {
    id: "children",
    title: "Children’s privacy",
    paragraphs: [
      `Our services are intended for adults who can form a binding contract. ${BRAND_NAME} does not knowingly collect personal information from children. If you believe a child has provided personal information to us, contact ${LEGAL_CONTACTS.privacy} so we can take appropriate steps.`,
    ],
  },
  {
    id: "updates",
    title: "Policy updates",
    paragraphs: [
      `We may update this Privacy Policy from time to time. The “Last updated” date at the top of the page will change when revisions are published. Please review this page periodically when using ${BRAND_SITE_HOST}.`,
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: ["For privacy questions or requests, contact:"],
    bullets: [
      `Privacy: ${LEGAL_CONTACTS.privacy}`,
      `Support: ${LEGAL_CONTACTS.support}`,
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary={`This Privacy Policy describes how ${BRAND_NAME} handles personal information for website use, customer accounts, eSIM orders and related support. It is a draft for final business and legal review.`}
      sections={sections}
    />
  );
}
