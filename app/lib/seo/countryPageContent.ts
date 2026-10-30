/**
 * Dynamic country/regional/global SEO copy (offline-QA safe).
 * Presentation only — no pricing, checkout, or provider I/O.
 */

import { BRAND_NAME } from "@/app/lib/brand";

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

/**
 * Unique, destination-based meta description for country pages.
 */
export function buildCountrySeoDescription(input: {
  name: string;
  kind: "country" | "regional" | "global";
}): string {
  const label = (input.name ?? "").trim() || "this destination";
  const kind = input.kind;
  const slug = label.toLowerCase();

  if (slug === "saudi arabia") {
    return `Buy best eSIM for Umrah and Saudi Arabia from ${BRAND_NAME}. High-speed 4G/5G data and Unlimited plans in Makkah and Madinah. Instant delivery by QR code.`;
  }
  if (slug === "pakistan") {
    return `Get instant travel eSIM for Pakistan from ${BRAND_NAME}. Affordable data plans for international visitors. Instant QR delivery.`;
  }
  if (slug === "united arab emirates" || slug === "uae") {
    return `Buy high-speed travel eSIM for UAE & Dubai from ${BRAND_NAME}. Instant QR code delivery, no physical SIM card swap needed.`;
  }
  if (slug === "turkey") {
    return `Get instant travel eSIM for Turkey from ${BRAND_NAME}. Reliable 4G/5G data packages for Istanbul and travel across Turkey.`;
  }
  if (slug === "iraq") {
    return `Buy reliable travel eSIM for Iraq from ${BRAND_NAME}. High-speed mobile data for Ziyarat, Baghdad, and Najaf with instant QR delivery.`;
  }
  if (slug === "malaysia") {
    return `Get instant travel eSIM for Malaysia from ${BRAND_NAME}. Smooth 4G/5G mobile data coverage for Kuala Lumpur and holiday travel.`;
  }

  if (kind === "regional") {
    return `Compare ${label} regional travel eSIM plans from ${BRAND_NAME}. Review data amounts and validity, then buy online and install by QR before you travel.`;
  }
  if (kind === "global") {
    return `Browse global travel eSIM plans from ${BRAND_NAME} for multi-country trips. Compare data and validity, then checkout and install by QR when you are ready.`;
  }
  return `Buy a travel eSIM for ${label} from ${BRAND_NAME}. Compare data plans and validity on this page, then install by QR — no physical SIM swap required.`;
}

export function buildCountrySeoContent(
  input: CountrySeoDestinationInput
): CountrySeoContentModel {
  const label = (input.name ?? "").trim() || "this destination";
  const kind = input.kind;
  const slug = label.toLowerCase();

  // 1. Saudi Arabia (Umrah & Hajj)
  if (slug === "saudi arabia") {
    return {
      introTitle: "Best eSIM for Umrah & Saudi Arabia",
      intro: "Stay connected in Makkah and Madinah with a fast Saudi Arabia eSIM from MAP eSIM. Choose from flexible fixed data packages or Unlimited data plans for total peace of mind during your pilgrimage.",
      whyTitle: "Why choose MAP eSIM for Saudi Arabia & Umrah",
      whyItems: [
        { title: "Unlimited Data Available", description: "Enjoy non-stop high-speed internet without worrying about data limits during your extended stay." },
        { title: "Strong Network in Haram", description: "Connect seamlessly with top Saudi networks like STC and Mobily for reliable coverage in Makkah and Madinah." },
        { title: "Instant Digital Delivery", description: "Get your QR code instantly via email after purchase so you are ready before your flight." },
        { title: "No Physical SIM Swap", description: "Keep your home SIM active while enjoying high-speed mobile data for your pilgrimage." },
      ],
      stepsTitle: "How to activate your Saudi Arabia eSIM",
      steps: [
        { title: "Choose Your Plan", description: "Select a fixed data package or an Unlimited data plan that fits your trip length." },
        { title: "Complete Checkout", description: "Confirm your order and receive your eSIM QR code instantly in your email inbox." },
        { title: "Install Before Travel", description: "Scan the QR code and install the eSIM profile on your phone while still at home." },
        { title: "Connect on Arrival", description: "Turn on data roaming as soon as you land in Saudi Arabia to start using high-speed internet." },
      ],
      faqs: [
        { question: "Are Unlimited data plans available for Saudi Arabia?", answer: "Yes! MAP eSIM offers high-speed Unlimited data plans for Saudi Arabia so you can stream, video call, and navigate without ever running out of data." },
        { question: "Will I get 4G/5G speed in Makkah and Madinah?", answer: "Yes! Map eSIM connects to top Saudi networks to give you strong and fast internet coverage everywhere, including inside the Haram areas." },
        { question: "When should I install and activate the eSIM?", answer: "You can scan the QR code and install the eSIM profile while you are still at home, and turn on data roaming as soon as you arrive in Saudi Arabia." },
        { question: "How do I get the QR code?", answer: "Your QR code and activation instructions are sent to your email immediately after payment confirmation." },
      ],
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Destinations", path: "/countries" },
        { name: "Saudi Arabia eSIM", path: input.path },
      ],
    };
  }

  // 2. Pakistan (For visitors)
  if (slug === "pakistan") {
    return {
      introTitle: "Best Travel eSIM for Pakistan",
      intro: "Stay connected across Pakistan with high-speed mobile data from MAP eSIM. Perfect for international travelers and visitors exploring the country.",
      whyTitle: "Why choose MAP eSIM for Pakistan",
      whyItems: [
        { title: "Instant Connectivity", description: "Get online as soon as you land in Islamabad, Lahore, or Karachi without waiting at airport kiosks." },
        { title: "Reliable Local Networks", description: "Connect to reliable local network infrastructure for smooth browsing and navigation." },
        { title: "Secure Digital Delivery", description: "Receive your QR code instantly by email before your trip." },
      ],
      stepsTitle: "How to activate your Pakistan eSIM",
      steps: [
        { title: "Choose Your Plan", description: "Select a data package that fits your duration in Pakistan." },
        { title: "Complete Checkout", description: "Pay securely and receive your QR code instantly." },
        { title: "Install Before Arrival", description: "Scan the QR code over Wi-Fi before boarding your flight." },
        { title: "Turn on Roaming", description: "Enable data roaming upon arrival in Pakistan to connect instantly." },
      ],
      faqs: [
        { question: "Which networks does MAP eSIM connect to in Pakistan?", answer: "It connects to leading local partner networks to ensure stable coverage." },
      ],
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Destinations", path: "/countries" },
        { name: "Pakistan eSIM", path: input.path },
      ],
    };
  }

  // 3. UAE / Dubai
  if (slug === "united arab emirates" || slug === "uae") {
    return {
      introTitle: "Best eSIM for UAE & Dubai",
      intro: "Explore Dubai and Abu Dhabi with a high-speed UAE travel eSIM from MAP eSIM. Enjoy seamless 5G connectivity across the Emirates.",
      whyTitle: "Why choose MAP eSIM for UAE",
      whyItems: [
        { title: "High-Speed 5G", description: "Experience lightning-fast internet speeds across Dubai, Abu Dhabi, and major UAE attractions." },
        { title: "Instant QR Delivery", description: "Get your setup details delivered instantly to your email." },
        { title: "No Roaming Shock", description: "Avoid expensive international carrier roaming bills with flat, affordable pricing." },
      ],
      stepsTitle: "How to activate your UAE eSIM",
      steps: [
        { title: "Choose Plan", description: "Select your data tier for your UAE trip." },
        { title: "Checkout", description: "Complete payment and get your QR code." },
        { title: "Install & Enjoy", description: "Install before travel and turn on upon landing." },
      ],
      faqs: [
        { question: "Will it work throughout Dubai and Abu Dhabi?", answer: "Yes, you get full nationwide coverage across the UAE." },
      ],
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Destinations", path: "/countries" },
        { name: "UAE eSIM", path: input.path },
      ],
    };
  }

  // 4. Turkey
  if (slug === "turkey") {
    return {
      introTitle: "Best Travel eSIM for Turkey",
      intro: "Discover Istanbul, Cappadocia, and the scenic coastlines of Turkey with a high-speed travel eSIM from MAP eSIM. Enjoy seamless connectivity on your travels.",
      whyTitle: "Why choose MAP eSIM for Turkey",
      whyItems: [
        { title: "Seamless Coverage", description: "Enjoy robust 4G/5G data speeds across Istanbul, Ankara, Antalya, and major tourist regions." },
        { title: "Instant Delivery", description: "Receive your QR code instantly in your inbox right after checkout." },
        { title: "No SIM Swapping", description: "Keep your primary home SIM safe while using affordable local data abroad." },
      ],
      stepsTitle: "How to activate your Turkey eSIM",
      steps: [
        { title: "Choose Plan", description: "Select your required data package for your trip to Turkey." },
        { title: "Checkout", description: "Complete your secure order to get the QR code." },
        { title: "Install & Activate", description: "Install before your flight and enable data upon landing in Turkey." },
      ],
      faqs: [
        { question: "Does MAP eSIM cover Istanbul and tourist regions?", answer: "Yes, you get comprehensive coverage across all major cities and tourist attractions in Turkey." },
      ],
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Destinations", path: "/countries" },
        { name: "Turkey eSIM", path: input.path },
      ],
    };
  }

  // 5. Iraq (Ziyarat & Travel)
  if (slug === "iraq") {
    return {
      introTitle: "Best Travel eSIM for Iraq",
      intro: "Stay connected across Iraq during your Ziyarat journey to Baghdad, Najaf, and Karbala with a high-speed travel eSIM from MAP eSIM.",
      whyTitle: "Why choose MAP eSIM for Iraq",
      whyItems: [
        { title: "Reliable Ziyarat Connectivity", description: "Stay in touch with family and navigate holy sites easily with stable mobile data." },
        { title: "Instant QR Delivery", description: "Get your connection details instantly via email before you depart." },
        { title: "No Physical SIM Needed", description: "Skip local queues in Iraq and get online immediately upon arrival." },
      ],
      stepsTitle: "How to activate your Iraq eSIM",
      steps: [
        { title: "Choose Plan", description: "Select a suitable data plan for your stay in Iraq." },
        { title: "Complete Order", description: "Checkout securely and receive your activation QR code." },
        { title: "Connect on Arrival", description: "Turn on data roaming when you arrive in Iraq to get online." },
      ],
      faqs: [
        { question: "Will I have coverage in Najaf and Karbala?", answer: "Yes, MAP eSIM provides reliable partner network coverage across key cities including Najaf, Karbala, and Baghdad." },
      ],
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Destinations", path: "/countries" },
        { name: "Iraq eSIM", path: input.path },
      ],
    };
  }

  // 6. Malaysia
  if (slug === "malaysia") {
    return {
      introTitle: "Best Travel eSIM for Malaysia",
      intro: "Experience Kuala Lumpur, Penang, and Langkawi with a high-speed travel eSIM from MAP eSIM. Fast, reliable, and affordable data for your holiday.",
      whyTitle: "Why choose MAP eSIM for Malaysia",
      whyItems: [
        { title: "Fast 4G/5G Speeds", description: "Stream, browse, and use ride-hailing apps effortlessly across Malaysia." },
        { title: "Instant QR Delivery", description: "No waiting around—get your eSIM configuration instantly by email." },
      ],
      stepsTitle: "How to activate your Malaysia eSIM",
      steps: [
        { title: "Select Plan", description: "Choose your data package for Malaysia." },
        { title: "Checkout & Receive", description: "Complete payment and get your QR code instantly." },
        { title: "Activate", description: "Install over Wi-Fi and activate roaming upon landing." },
      ],
      faqs: [
        { question: "Is data fast in Kuala Lumpur?", answer: "Yes, enjoy high-speed network connections across major Malaysian cities." },
      ],
      breadcrumbs: [
        { name: "Home", path: "/" },
        { name: "Destinations", path: "/countries" },
        { name: "Malaysia eSIM", path: input.path },
      ],
    };
  }

  // Default Content for other countries
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
      { title: "Digital delivery", description: "After purchase, eSIM order details are available in your account and by email when delivery succeeds." },
      { title: "No physical SIM required", description: `Use digital connectivity for ${coverage} without swapping your home SIM card.` },
      { title: "Clear plan details", description: "Compare data, validity, and coverage before you buy. Checkout still verifies the live offer before creating an order." },
      { title: "Install help", description: "Follow iPhone and Android installation guides when you are ready to go online." },
    ],
    stepsTitle: `How to activate your ${label} eSIM`,
    steps: [
      { title: "Choose a plan", description: `Select a ${label} eSIM plan that matches your trip length and data needs.` },
      { title: "Complete checkout", description: "Confirm the verified offer and complete checkout. Order details appear in My eSIMs and email when delivery succeeds." },
      { title: "Install on your phone", description: "Use the QR code or manual details from your order. You can usually install over Wi-Fi before you travel." },
      { title: "Enable data when you arrive", description: `Turn on the eSIM line and data roaming if required, then connect on arrival in ${coverage}.` },
    ],
    faqs: [
      { question: `Do I need an unlocked phone for a ${label} eSIM?`, answer: "Yes in most cases. Your device must support eSIM and is normally carrier-unlocked so it can join partner networks abroad." },
      { question: `When should I install my ${label} eSIM?`, answer: "You can usually install before travel over Wi-Fi. Keep the line ready, then enable mobile data and roaming after you arrive if your plan requires it." },
      { question: "Will my home number keep working?", answer: "Your physical SIM or existing line can stay in the phone. Follow the install instructions so the travel eSIM is used for data when you want it." },
      { question: "How do I get the QR code?", answer: "Open My eSIMs after purchase and choose Install eSIM, or use the installation email when delivery succeeds." },
      { question: `What if I need help with my ${label} eSIM?`, answer: "Use the Support Center, iPhone and Android install guides, or contact MAP eSIM with your order reference." },
    ],
    breadcrumbs: [
      { name: "Home", path: "/" },
      { name: "Destinations", path: "/countries" },
      { name: `${label} eSIM`, path: input.path },
    ],
  };
}