import type { Metadata } from "next";
import "./globals.css";
import NavbarShell from "./components/NavbarShell";
import Footer from "./components/Footer";
import CookieConsentProvider from "./components/cookies/CookieConsentProvider";
import PreferenceStorageSync from "./components/cookies/PreferenceStorageSync";
import { CurrencyProvider } from "./components/currency/CurrencyProvider";
import JsonLd from "./components/seo/JsonLd";
import ThemeProvider from "./components/theme/ThemeProvider";
import WhatsAppSupportButton from "./components/support/WhatsAppSupportButton";
import HideOnShare from "./components/share/HideOnShare";
import { BRAND_NAME, BRAND_SITE_URL, BRAND_TAGLINE } from "@/app/lib/brand";
import {
  DEFAULT_THEME,
  themePreferenceToHtmlClass,
} from "@/app/lib/cookies/preferenceCookies";
import {
  organizationNode,
  websiteNode,
} from "@/app/lib/seo/siteGraph";
import { DEFAULT_SOCIAL_SHARE_IMAGE } from "@/app/lib/seo/socialShareMeta";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND_SITE_URL),
  applicationName: BRAND_NAME,
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
  openGraph: {
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
    // Do not set openGraph.url here — a root homepage URL was leaking into
    // child routes that omit their own og:url and confused crawler canonicals.
    siteName: BRAND_NAME,
    type: "website",
    images: [DEFAULT_SOCIAL_SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
    images: [DEFAULT_SOCIAL_SHARE_IMAGE.url],
  },
};

/**
 * Public shell intentionally avoids server session and request-cookie reads so
 * marketing and catalog routes can use ISR/CDN caching. Session, consent, and
 * preference values are rehydrated in client islands (NavbarShell,
 * CookieConsentProvider, theme/currency providers).
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const htmlThemeClass = themePreferenceToHtmlClass(DEFAULT_THEME);

  const siteGraph = {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), websiteNode()],
  };

  return (
    <html lang="en" className={htmlThemeClass} suppressHydrationWarning>
      <body>
        <CookieConsentProvider
          initialConsent={null}
          initialPreferencesAllowed={false}
        >
          <ThemeProvider>
            <PreferenceStorageSync />
            <CurrencyProvider>
              <HideOnShare>
                <JsonLd data={siteGraph} />
                <NavbarShell />
              </HideOnShare>
              {children}
              <HideOnShare>
                <Footer />
                <WhatsAppSupportButton />
              </HideOnShare>
            </CurrencyProvider>
          </ThemeProvider>
        </CookieConsentProvider>
      </body>
    </html>
  );
}
