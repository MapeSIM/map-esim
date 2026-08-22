/**
 * Dynamic country/regional/global SEO copy (offline-QA safe).
 * Presentation only — no pricing, checkout, or provider I/O.
 */

export type CountrySeoDestinationInput = {
  name: string;
  kind: "country" | "regional" | "global";
  path: string;
};

export type CountrySeoFaq = {
  question: string;
  answer: string;
};

export type CountrySeoContentModel = {
  introTitle: string;
  intro: string;
  whyTitle: string;
  whyItems: Array<{ title: string; description: string }>;
  stepsTitle: string;
  steps: Array<{ title: string; description: string }>;
  faqs: CountrySeoFaq[];
  breadcrumbs: Array<{ name: string; path: string }>;
};

export function buildCountrySeoContent(
  input: CountrySeoDestinationInput
): CountrySeoContentModel {
  const label = (input.name ?? "").trim() || "this destination";
  const kind = input.kind;
  const coverage =
    kind === "regional"
      ? `this ${label} regional plan`
      : kind === "global"
        ? "this global plan"
        : label;

  const intro =
    kind === "regional"
      ? `Stay connected across ${label} with a travel eSIM from MAP eSIM. Compare data, validity, and coverage on this page, then checkout with verified offer details.`
      : kind === "global"
        ? `Use a global travel eSIM from MAP eSIM for multi-country trips. Review plan details below, then continue to checkout when you are ready.`
        : `Stay connected in ${label} with a travel eSIM from MAP eSIM. Browse data amounts and validity on this page, then checkout with verified offer details — no physical SIM swap required.`;

  return {
    introTitle: `${label} eSIM`,
    intro,
    whyTitle: `Why choose MAP eSIM for ${label}`,
    whyItems: [
      {
        title: "Digital delivery",
        description:
          "After purchase, eSIM order details are available in your account and by email when delivery succeeds.",
      },
      {
        title: "No physical SIM required",
        description: `Use digital connectivity for ${coverage} without swapping your home SIM card.`,
      },
      {
        title: "Clear plan details",
        description:
          "Compare data, validity, and coverage before you buy. Checkout still verifies the live offer before creating an order.",
      },
      {
        title: "Install help",
        description:
          "Follow iPhone and Android installation guides when you are ready to go online.",
      },
    ],
    stepsTitle: `How to activate your ${label} eSIM`,
    steps: [
      {
        title: "Choose a plan",
        description: `Select a ${label} eSIM plan that matches your trip length and data needs.`,
      },
      {
        title: "Complete checkout",
        description:
          "Confirm the verified offer and complete checkout. Order details appear in My eSIMs and email when delivery succeeds.",
      },
      {
        title: "Install on your phone",
        description:
          "Use the QR code or manual details from your order. You can usually install over Wi-Fi before you travel.",
      },
      {
        title: "Enable data when you arrive",
        description: `Turn on the eSIM line and data roaming if required, then connect on arrival in ${coverage}.`,
      },
    ],
    faqs: [
      {
        question: `Do I need an unlocked phone for a ${label} eSIM?`,
        answer:
          "Yes in most cases. Your device must support eSIM and is normally carrier-unlocked so it can join partner networks abroad.",
      },
      {
        question: `When should I install my ${label} eSIM?`,
        answer:
          "You can usually install before travel over Wi-Fi. Keep the line ready, then enable mobile data and roaming after you arrive if your plan requires it.",
      },
      {
        question: "Will my home number keep working?",
        answer:
          "Your physical SIM or existing line can stay in the phone. Follow the install instructions so the travel eSIM is used for data when you want it.",
      },
      {
        question: "How do I get the QR code?",
        answer:
          "Open My eSIMs after purchase and choose View QR Code & Details, or use the installation email when delivery succeeds.",
      },
      {
        question: `What if I need help with my ${label} eSIM?`,
        answer:
          "Use the Support Center, iPhone and Android install guides, or contact MAP eSIM with your order reference.",
      },
    ],
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Destinations", path: "/countries" },
      { name: `${label} eSIM`, path: input.path },
    ],
  };
}
