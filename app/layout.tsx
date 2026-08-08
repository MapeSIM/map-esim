import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CookieConsentProvider from "./components/cookies/CookieConsentProvider";
import PreferenceStorageSync from "./components/cookies/PreferenceStorageSync";
import { CurrencyProvider } from "./components/currency/CurrencyProvider";
import JsonLd from "./components/seo/JsonLd";
import ThemeProvider from "./components/theme/ThemeProvider";
import { auth } from "@/auth";
import { navAuthLink } from "@/app/lib/auth/redirects";
import { BRAND_NAME, BRAND_SITE_URL, BRAND_TAGLINE } from "@/app/lib/brand";
import { getServerCookieConsent } from "@/app/lib/cookies/consentActions";
import {
  CURRENCY_PREFERENCE_COOKIE,
  resolveServerCurrencyPreference,
  resolveServerThemePreference,
  THEME_PREFERENCE_COOKIE,
  themePreferenceToHtmlClass,
} from "@/app/lib/cookies/preferenceCookies";
import { organizationNode, websiteNode } from "@/app/lib/seo/siteGraph";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND_SITE_URL),
  applicationName: BRAND_NAME,
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
  openGraph: {
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
    url: BRAND_SITE_URL,
    siteName: BRAND_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_NAME,
    description: BRAND_TAGLINE,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const initialCookieConsent = await getServerCookieConsent();
  const initialPreferencesAllowed = Boolean(
    initialCookieConsent?.preferences
  );

  const jar = await cookies();
  const initialTheme = resolveServerThemePreference(
    initialPreferencesAllowed,
    jar.get(THEME_PREFERENCE_COOKIE)?.value
  );
  const initialCurrency = resolveServerCurrencyPreference(
    initialPreferencesAllowed,
    jar.get(CURRENCY_PREFERENCE_COOKIE)?.value
  );
  const htmlThemeClass = themePreferenceToHtmlClass(initialTheme);

  const sessionRole =
    session?.user?.role === "ADMIN"
      ? "ADMIN"
      : session?.user?.id
        ? "CUSTOMER"
        : null;
  const { href: authHref, label: authLabel } = navAuthLink({
    userId: session?.user?.id,
    role: sessionRole,
  });

  const siteGraph = {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), websiteNode()],
  };

  return (
    <html lang="en" className={htmlThemeClass} suppressHydrationWarning>
      <body>
        <JsonLd data={siteGraph} />
        <CookieConsentProvider
          initialConsent={initialCookieConsent}
          initialPreferencesAllowed={initialPreferencesAllowed}
        >
          <ThemeProvider initialTheme={initialTheme}>
            <PreferenceStorageSync />
            <CurrencyProvider initialCurrency={initialCurrency}>
              <Navbar authHref={authHref} authLabel={authLabel} />
              {children}
              <Footer />
            </CurrencyProvider>
          </ThemeProvider>
        </CookieConsentProvider>
      </body>
    </html>
  );
}
