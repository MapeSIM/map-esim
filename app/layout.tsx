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
import WhatsAppSupportButton from "./components/support/WhatsAppSupportButton";
import HideOnShare from "./components/share/HideOnShare";
import { auth } from "@/auth";
import { coerceAppRole } from "@/app/lib/auth/appRole";
import { navAuthLink } from "@/app/lib/auth/redirects";
import { getPartnerPortalSummary } from "@/app/lib/partner/partnerAccess";
import { BRAND_NAME, BRAND_SITE_URL, BRAND_TAGLINE } from "@/app/lib/brand";
import { getCustomerWalletSummary } from "@/app/lib/wallet/read";
import type { NavbarCustomerSummary } from "./components/Navbar";
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
    // Do not set openGraph.url here — a root homepage URL was leaking into
    // child routes that omit their own og:url and confused crawler canonicals.
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

  const sessionRole = session?.user?.id
    ? coerceAppRole(session.user.role)
    : null;
  const { href: authHref, label: authLabel } = navAuthLink({
    userId: session?.user?.id,
    role: sessionRole,
  });

  let customerNav: NavbarCustomerSummary | null = null;
  let partnerNav: NavbarCustomerSummary | null = null;
  if (sessionRole === "CUSTOMER" && session?.user?.id) {
    const name = (session.user.name ?? "").trim() || "Customer";
    const email = (session.user.email ?? "").trim();
    try {
      const summary = await getCustomerWalletSummary(session.user.id);
      customerNav = {
        name,
        email,
        walletBalanceLabel: summary?.balanceLabel ?? "$0.00",
        walletCurrency: summary?.currency ?? "USD",
      };
    } catch {
      customerNav = {
        name,
        email,
        walletBalanceLabel: null,
        walletCurrency: "USD",
      };
    }
  }

  if (sessionRole === "PARTNER" && session?.user?.id) {
    const name = (session.user.name ?? "").trim() || "Partner";
    const email = (session.user.email ?? "").trim();
    try {
      const summary = await getPartnerPortalSummary(session.user.id);
      partnerNav = {
        name,
        email,
        walletBalanceLabel: summary?.balanceLabel ?? "$0.00",
        walletCurrency: "USD",
      };
    } catch {
      partnerNav = {
        name,
        email,
        walletBalanceLabel: null,
        walletCurrency: "USD",
      };
    }
  }

  const siteGraph = {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), websiteNode()],
  };

  return (
    <html lang="en" className={htmlThemeClass} suppressHydrationWarning>
      <body>
        <CookieConsentProvider
          initialConsent={initialCookieConsent}
          initialPreferencesAllowed={initialPreferencesAllowed}
        >
          <ThemeProvider initialTheme={initialTheme}>
            <PreferenceStorageSync />
            <CurrencyProvider initialCurrency={initialCurrency}>
              <HideOnShare>
                <JsonLd data={siteGraph} />
                <Navbar
                  authHref={authHref}
                  authLabel={authLabel}
                  customer={customerNav}
                  partner={partnerNav}
                />
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
