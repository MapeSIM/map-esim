import type { Metadata } from "next";
import LegalDocument from "@/app/components/legal/LegalDocument";
import { BRAND_NAME, BRAND_SITE_HOST } from "@/app/lib/brand";
import { LEGAL_CONTACTS, type LegalSection } from "@/app/lib/legal";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

export const metadata: Metadata = {
  title: `Cookie Policy | ${BRAND_NAME}`,
  description: `How ${BRAND_NAME} uses cookies and similar technologies.`,
  alternates: { canonical: absoluteCanonical("/cookie-policy") },
};

const sections: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    paragraphs: [
      `This Cookie Policy explains how ${BRAND_NAME} uses cookies and similar technologies on ${BRAND_SITE_HOST}. It should be read together with our Privacy Policy.`,
      "This page is a professional draft prepared for business and legal review.",
    ],
  },
  {
    id: "what-are-cookies",
    title: "What are cookies?",
    paragraphs: [
      "Cookies are small text files stored on your device when you visit a website. They help the site function, remember preferences or understand how the site is used. Similar technologies may include local storage or session storage used for the same kinds of purposes.",
    ],
  },
  {
    id: "current-status",
    title: "Current cookie status",
    callout:
      "MAP eSIM uses essential cookies for authentication, sessions and security. Optional live-chat support (Tawk.to) may load only after you grant marketing cookie consent and only on selected public pages. Analytics advertising pixels are not claimed as active unless separately introduced and disclosed.",
    paragraphs: [
      "The categories below describe cookies and similar technologies we use now and categories that may be used with consent.",
    ],
  },
  {
    id: "essential",
    title: "Essential cookies",
    paragraphs: [
      "Essential cookies are required for core site and account functionality. They cannot be switched off in our systems if you want to use login, checkout-related session continuity or protected account features.",
    ],
    bullets: [
      "Keep you signed in during a session",
      "Support secure authentication flows (including security-related session cookies)",
      "Help protect against abuse and unauthorized access",
      "Remember security steps such as password-reset authorization where applicable",
    ],
  },
  {
    id: "authentication",
    title: "Authentication and session cookies",
    paragraphs: [
      "These cookies (a subset of essential cookies) maintain signed-in sessions and related account security state. Without them, account login and protected pages may not work reliably.",
    ],
  },
  {
    id: "security",
    title: "Security and fraud-prevention cookies",
    paragraphs: [
      "Security-related cookies or similar storage may be used to support fraud prevention, session integrity and abuse controls. These are treated as essential to operating a secure service.",
    ],
  },
  {
    id: "preference",
    title: "Preference cookies",
    paragraphs: [
      "Preference cookies remember choices such as theme or display preferences where implemented. Some preferences may be stored locally in your browser rather than as a server cookie.",
      "Where preference cookies are non-essential, they should only be used in line with your choices once a consent tool is available.",
    ],
  },
  {
    id: "analytics",
    title: "Analytics cookies",
    paragraphs: [
      "Analytics cookies help understand how visitors use the website (for example pages visited or technical performance). They are not required for basic browsing or account login.",
      `${BRAND_NAME} does not currently claim that analytics cookies are active. If analytics tools are introduced later, they will require consent before use where required by law, and this policy will be updated.`,
    ],
  },
  {
    id: "marketing",
    title: "Marketing cookies",
    paragraphs: [
      "Marketing cookies and similar technologies may be used for optional campaign measurement, advertising, or embedded live-chat support tools. They are not required for purchasing an eSIM or using your account.",
      `When configured, ${BRAND_NAME} may load the Tawk.to live-chat widget after marketing consent on selected public pages (for example Support and destination browsing). Chat messages you send are processed by that provider to deliver support. You can reject or turn off marketing cookies in the consent tool; the widget will not load without that consent.`,
    ],
  },
  {
    id: "your-choices",
    title: "Your choices",
    paragraphs: [
      "Essential cookies are required for account, login and security functionality.",
      "Analytics and marketing cookies, if introduced, must require consent. Customers will be able to accept, reject or manage non-essential cookies through a consent tool before those cookies are set (except where a different legal basis clearly applies).",
      "You can also use browser controls to block or delete cookies. Blocking essential cookies may affect login, checkout or account features.",
    ],
  },
  {
    id: "updates",
    title: "Policy updates",
    paragraphs: [
      "We may update this Cookie Policy when our cookie practices change — for example if analytics or marketing tools are added. The “Last updated” date will change when revisions are published.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: ["For cookie or privacy questions, contact:"],
    bullets: [
      `Privacy: ${LEGAL_CONTACTS.privacy}`,
      `Support: ${LEGAL_CONTACTS.support}`,
    ],
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalDocument
      title="Cookie Policy"
      summary={`This Cookie Policy explains how ${BRAND_NAME} uses essential cookies today and how non-essential cookies would be handled if introduced later. It is a draft for final business and legal review.`}
      sections={sections}
    />
  );
}
