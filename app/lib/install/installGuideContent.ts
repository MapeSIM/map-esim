/**
 * Public install-guide copy (offline-QA safe).
 * Presentation only — no QR generation, provider calls, or order I/O.
 */

export type InstallGuidePlatform = "iphone" | "android";

export type InstallGuideModel = {
  eyebrow: string;
  title: string;
  intro: string;
  checklistTitle: string;
  checklist: string[];
  stepsTitle: string;
  steps: Array<{ title: string; description: string }>;
  issuesTitle: string;
  issues: Array<{ question: string; answer: string }>;
  supportTitle: string;
  supportBody: string;
  otherGuide: { href: string; label: string };
};

const SHARED_CHECKLIST = [
  "Your phone supports eSIM and is normally carrier-unlocked.",
  "You have a stable Wi-Fi connection for installation.",
  "Your MAP eSIM QR image or SM-DP+ details are ready from My eSIMs or your order email.",
  "You can usually install before travel, then enable data after you arrive.",
];

export function buildInstallGuideContent(
  platform: InstallGuidePlatform
): InstallGuideModel {
  if (platform === "iphone") {
    return {
      eyebrow: "iPhone",
      title: "iPhone eSIM installation guide",
      intro:
        "Use the verified QR code or manual SM-DP+ details from your MAP eSIM order. A one-tap Install on iPhone button appears only when your order includes an official carrier activation link.",
      checklistTitle: "Before you start",
      checklist: [
        ...SHARED_CHECKLIST,
        "Have a second screen or printout if your iPhone cannot scan a QR from its own Photos library.",
      ],
      stepsTitle: "Install on iPhone",
      steps: [
        {
          title: "Get your QR or manual details",
          description:
            "Download or save the MAP eSIM QR PNG from your order email attachment or the success page download button. Manual SM-DP+ details are in My eSIMs if you need them.",
        },
        {
          title: "Open Add eSIM",
          description:
            "Go to Settings → Cellular (or Mobile Service) → Add eSIM.",
        },
        {
          title: "Scan the QR code",
          description:
            "Choose Use QR Code. Scan the saved image from another screen when your iPhone cannot scan from its own Photos library.",
        },
        {
          title: "Optional: add from Mail or Safari",
          description:
            "On iOS 17.4 or later, you can press and hold the QR code in Mail or Safari and select Add eSIM, then follow Apple’s Allow / Continue confirmation.",
        },
        {
          title: "Enter details manually if needed",
          description:
            "If QR scanning is unavailable, choose Enter Details Manually and use the SM-DP+ address and activation code from your order.",
        },
        {
          title: "Enable data when you arrive",
          description:
            "After arriving at your destination, enable the eSIM line and turn on Data Roaming for that line when the plan requires it.",
        },
      ],
      issuesTitle: "Common issues",
      issues: [
        {
          question: "The camera cannot scan the QR from Photos",
          answer:
            "Display the QR on another device or a printout, then scan it with the iPhone camera. Same-phone gallery scans often fail.",
        },
        {
          question: "I do not see Add eSIM",
          answer:
            "Confirm the device supports eSIM and is carrier-unlocked. Use the device compatibility guide if the setting is missing.",
        },
        {
          question: "There is no one-tap Install on iPhone button",
          answer:
            "That button appears only when the order includes an official carrier activation link. Use QR or manual SM-DP+ details instead.",
        },
        {
          question: "The eSIM installed but I have no data",
          answer:
            "Select the travel eSIM for mobile data, then enable Data Roaming for that line after you arrive if the plan requires it.",
        },
      ],
      supportTitle: "Need help with installation?",
      supportBody:
        "Open Support Center or Contact with your masked Order ID. Do not send full ICCID or activation codes in public chats.",
      otherGuide: {
        href: "/install/android",
        label: "Android install guide",
      },
    };
  }

  return {
    eyebrow: "Android",
    title: "Android eSIM installation guide",
    intro:
      "MAP eSIM does not claim universal one-click Android installation. Use the downloadable QR code from your order email or success page, then follow the steps for your device.",
    checklistTitle: "Before you start",
    checklist: [
      ...SHARED_CHECKLIST,
      "Menu names differ on Samsung, Google Pixel, Xiaomi, and other Android phones.",
    ],
    stepsTitle: "Install on Android",
    steps: [
      {
        title: "Get your QR or manual details",
        description:
          "Download or save the MAP eSIM QR PNG from your order email attachment or the success page download button.",
      },
      {
        title: "Open SIM settings",
        description:
          "Open Settings → Network & Internet → SIMs (wording may vary by manufacturer).",
      },
      {
        title: "Add or download an eSIM",
        description:
          "Tap Add eSIM or Download a SIM instead.",
      },
      {
        title: "Scan the QR code",
        description:
          "Choose Use QR code and scan the saved image from another screen or a printed copy when your phone cannot scan from its own gallery.",
      },
      {
        title: "Enter details manually if needed",
        description:
          "If QR scanning is unavailable, enter the SM-DP+ address and activation code from your order details manually.",
      },
      {
        title: "Enable data when you arrive",
        description:
          "After you arrive at your destination, enable the eSIM line and turn on Data roaming for that line when the plan requires it.",
      },
    ],
    issuesTitle: "Common issues",
    issues: [
      {
        question: "I cannot find Add eSIM",
        answer:
          "Search Settings for eSIM, SIMs, or Download a SIM. Manufacturers use different labels. If the option is missing, the phone may not support eSIM or may be locked.",
      },
      {
        question: "The phone will not scan a QR from the gallery",
        answer:
          "Show the QR on another screen or print it, then scan with the camera. Same-phone gallery scans often fail.",
      },
      {
        question: "Is there a one-tap Android install button?",
        answer:
          "MAP eSIM does not claim universal one-click Android installation. Use QR or manual SM-DP+ details from your order.",
      },
      {
        question: "The eSIM installed but I have no data",
        answer:
          "Set the travel eSIM as the mobile data SIM, then enable Data roaming for that line after you arrive if the plan requires it.",
      },
    ],
    supportTitle: "Need help with installation?",
    supportBody:
      "Open Support Center or Contact with your masked Order ID. Device menus differ across Android brands, so include your phone model when you can.",
    otherGuide: {
      href: "/install/iphone",
      label: "iPhone install guide",
    },
  };
}
