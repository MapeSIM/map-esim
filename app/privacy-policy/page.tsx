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
      `${BRAND_NAME} provides digital eSIM connectivity services through ${BRAND_SITE_HOST}. This Privacy Policy explains how we handle personal information when you visit our website, create a customer or Partner account, purchase or install an eSIM, use a shared eSIM link, contact support, or otherwise use our services.`,
      `It applies to website visitors, customer accounts, eSIM customers, Partner / reseller accounts, people who open a shared eSIM installation link, and people who contact ${BRAND_NAME} for support.`,
      `${BRAND_NAME} is a web-based service. We do not operate a native mobile application, do not request mobile-app device permissions, and do not access a physical SIM card on your device.`,
    ],
  },
  {
    id: "information-we-collect",
    title: "Information we collect",
    paragraphs: [
      "The information we collect depends on how you use MAP eSIM.",
    ],
    bullets: [
      "Account: name, email address, profile information you choose to share, and a password stored only as a secure hash (we do not store your password in plain text).",
      "Google Sign-In (when you choose it): Google email address, display name, profile image when Google supplies one, and a Google account identifier. We do not receive or store your Google password.",
      "Orders: destination, eSIM plan details, order references, purchase information needed to fulfil the order, and installation status.",
      "Support: messages and related correspondence you send to us.",
      "Automatically collected technical data: IP address, browser and device information, and security or activity logs used for authentication, account protection and abuse prevention.",
    ],
  },
  {
    id: "esim-installation-data",
    title: "eSIM installation data",
    paragraphs: [
      "To let you install an eSIM we may process sensitive operational installation data, including QR codes, LPA activation information, SM-DP+ addresses and activation codes.",
      "This information is treated as restricted operational data. Access is limited to protected channels such as an authenticated customer or Partner order view, a token-authorized shared eSIM page, or the email address associated with the order. We do not use installation credentials for marketing.",
      "You should keep QR codes, LPA strings and activation codes confidential. Do not post them publicly or send them through untrusted channels.",
    ],
  },
  {
    id: "partner-services",
    title: "Partner services",
    paragraphs: [
      `${BRAND_NAME} offers Partner / reseller accounts for businesses that buy and manage eSIMs for their own customers. Partner data is used only to provide Partner services.`,
    ],
    bullets: [
      "Partner account details used to sign in and operate the Partner portal",
      "Partner branding information you submit for share pages (for example company name, logo, button colours and support contact details)",
      "Shared eSIM links created from Partner orders, which allow a recipient to view installation details without a MAP eSIM login",
      "Partner order management information needed to view, install, share or request support for Partner-owned eSIMs",
    ],
  },
  {
    id: "payment-processing",
    title: "Payment processing",
    callout:
      "Payments are processed by external payment providers under those providers’ own terms and privacy notices.",
    paragraphs: [
      `${BRAND_NAME} does not store complete payment card numbers on its own systems. Card and payment credentials, if collected, are handled by the relevant payment provider.`,
      "Where you use a MAP eSIM wallet or account credit, we store the credit or debit records needed to operate that balance, show history and complete eligible purchases. Wallet and credit records are not a substitute for the payment provider’s own privacy notice.",
    ],
  },
  {
    id: "rewards-system",
    title: "Rewards system",
    paragraphs: [
      `${BRAND_NAME} may operate a customer rewards programme for eligible customer purchases. This is a MAP eSIM customer benefit and is not a third-party rewards brand.`,
    ],
    bullets: [
      "Reward points earned from eligible purchases",
      "Your points balance",
      "Redemption history",
      "Use of rewards during checkout when that option is available",
    ],
  },
  {
    id: "email-communications",
    title: "Email communications",
    paragraphs: [
      "We send transactional and service emails related to your account, orders and support. Typical messages include:",
    ],
    bullets: [
      "Order confirmation and fulfilment emails",
      "Installation and eSIM-ready emails",
      "Security emails such as verification codes, password-reset codes and account-security alerts",
      "Support correspondence",
    ],
  },
  {
    id: "cookies-and-tracking",
    title: "Cookies and tracking",
    paragraphs: [
      `${BRAND_NAME} uses cookies and similar technologies as described in our Cookie Policy. We only claim the categories we actually use.`,
    ],
    bullets: [
      "Essential cookies required for the website to function",
      "Login and session cookies that keep you signed in on protected pages",
      "Security cookies and similar storage used for session integrity and abuse prevention",
      "Optional marketing cookies: Tawk.to live chat may load on selected public pages only after you grant marketing cookie consent. We do not currently claim that analytics or advertising pixels are active.",
    ],
  },
  {
    id: "how-we-use",
    title: "How we use information",
    paragraphs: ["We use personal information to:"],
    bullets: [
      "Provide, operate and improve the website, customer accounts and Partner services",
      "Create and secure accounts, including email verification and optional Google Sign-In",
      "Fulfil eSIM orders and deliver installation information through protected channels",
      "Operate shared eSIM links and Partner branding on those pages",
      "Process wallet or account credits and eligible customer rewards",
      "Send order, installation, security and support emails",
      "Detect, investigate and help prevent fraud, abuse and security incidents",
      "Meet legal, accounting and operational record-keeping needs",
    ],
  },
  {
    id: "sharing",
    title: "Sharing with service providers",
    paragraphs: [
      "We share personal information only as needed with service providers that help us operate MAP eSIM, such as our third-party eSIM connectivity provider, email delivery infrastructure, hosting and security providers, external payment providers, and — if you grant marketing cookie consent — the Tawk.to live-chat provider on selected public pages. We do not sell your personal information.",
      "When you use Google Sign-In, Google acts as an identity provider so we can create or sign you into your MAP eSIM account. That use is for authentication and account security, not marketing.",
      "If you use optional live chat, the chat provider may process the messages and technical data needed to operate the widget. We do not automatically send your account email, order references, QR codes, ICCIDs, activation codes or payment details to the chat provider through the website integration.",
    ],
  },
  {
    id: "data-security",
    title: "Data security",
    paragraphs: [
      "We use technical and organizational safeguards appropriate to the sensitivity of the information we handle, including:",
    ],
    bullets: [
      "Secure password hashing (passwords are not stored in plain text)",
      "Access controls for accounts, Partner portals and installation details",
      "Protected handling of QR codes, LPA data, SM-DP+ addresses and activation codes",
      "Session controls and security monitoring to help detect unauthorized access, fraud or abuse",
    ],
  },
  {
    id: "data-retention",
    title: "Data retention",
    paragraphs: [
      "We retain personal information only for as long as reasonably needed for the purposes in this policy.",
    ],
    bullets: [
      "Account data is kept while your account is active and for a reasonable period afterwards for security and support.",
      "Order records are kept to fulfil the eSIM, provide installation support and meet accounting or legal requirements.",
      "Support records are kept as needed to handle your request and related follow-up.",
      "Some records may be retained longer where required for legal, accounting, fraud-prevention or dispute-handling reasons.",
    ],
  },
  {
    id: "account-deletion",
    title: "Account deletion",
    paragraphs: [
      "Customers may request account deletion through the account security controls where available, or by contacting us. When an account is deleted, we take steps to revoke sessions, disable password login, invalidate outstanding authentication codes and anonymize personal profile fields such as name and email where feasible.",
      "Order, payment, wallet, rewards and provider records that we must keep for support, accounting, fraud prevention or legal reasons may be retained even after the account login is removed. Those records may no longer be linked to an active customer login.",
    ],
  },
  {
    id: "privacy-rights",
    title: "Privacy rights",
    paragraphs: [
      `Depending on where you live, you may have rights under applicable privacy laws, including the rights listed below. To exercise them, email ${LEGAL_CONTACTS.privacy} (or use the contact details at the end of this page). We may need to verify your request before responding.`,
    ],
    bullets: [
      "Access personal information we hold about you",
      "Request correction of inaccurate information",
      "Request deletion, subject to records we must retain",
      "Withdraw consent where processing is based on consent (for example non-essential cookies)",
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
    id: "international",
    title: "International data transfers",
    paragraphs: [
      `${BRAND_NAME} works with service providers that may operate or process information in more than one country, including eSIM fulfilment, hosting, email, payment and optional live-chat providers. Where information is processed internationally, we take reasonable steps appropriate to the nature of the service and applicable law.`,
    ],
  },
  {
    id: "updates",
    title: "Policy updates",
    paragraphs: [
      `We may update this Privacy Policy from time to time. When we do, we will change the “Last updated” date shown on this page. Please review this page periodically when using ${BRAND_SITE_HOST}. If a change is material, we may also provide an additional notice through the website or a service email where appropriate.`,
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      "To exercise privacy rights or ask a question about this policy, contact us. We may need to verify your request before responding.",
    ],
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
      summary={`This Privacy Policy describes how ${BRAND_NAME} handles personal information for website visitors, customer accounts, eSIM orders, Partner services, shared eSIM links and support.`}
      sections={sections}
    />
  );
}
