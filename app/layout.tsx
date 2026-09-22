import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import NavbarShell from "./components/NavbarShell";
import Footer from "./components/Footer";
import { ShellAuthProvider } from "./components/auth/ShellAuthContext";
import CookieConsentProvider from "./components/cookies/CookieConsentProvider";
import PreferenceStorageSync from "./components/cookies/PreferenceStorageSync";
import { CurrencyProvider } from "./components/currency/CurrencyProvider";
import JsonLd from "./components/seo/JsonLd";
import ThemeProvider from "./components/theme/ThemeProvider";
import DeferredWhatsAppSupportButton from "./components/support/DeferredWhatsAppSupportButton";
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
import { defaultSocialShareImages } from "@/app/lib/seo/socialShareMeta";

const { openGraphImages, twitterImages } = defaultSocialShareImages();

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
    images: openGraphImages,
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
    images: twitterImages,
  },
};

/** Fit all phone widths; pinch-zoom remains available for accessibility. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
              <ShellAuthProvider>
                <HideOnShare>
                  <JsonLd data={siteGraph} />
                  <NavbarShell />
                </HideOnShare>
                {children}
                <HideOnShare>
                  <Footer />
                  <DeferredWhatsAppSupportButton />
                </HideOnShare>
              </ShellAuthProvider>
            </CurrencyProvider>
          </ThemeProvider>
        </CookieConsentProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
