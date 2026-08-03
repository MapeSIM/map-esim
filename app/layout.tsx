import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import CookieConsentProvider from "./components/cookies/CookieConsentProvider";
import { CurrencyProvider } from "./components/currency/CurrencyProvider";
import ThemeProvider from "./components/theme/ThemeProvider";
import { auth } from "@/auth";
import { navAuthLink } from "@/app/lib/auth/redirects";
import { BRAND_NAME, BRAND_TAGLINE } from "@/app/lib/brand";
import { getServerCookieConsent } from "@/app/lib/cookies/consentActions";
import { CURRENCY_STORAGE_KEY } from "@/app/lib/currency/currencies";
import { THEME_STORAGE_KEY } from "@/app/lib/cookies/preferenceStorage";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
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

  // Always render the same Script node; only clear when Preferences are not allowed.
  // Does not apply theme classes — next-themes owns that.
  const clearOptionalPrefsScript = `try{if(!${
    initialPreferencesAllowed ? "true" : "false"
  }){localStorage.removeItem(${JSON.stringify(
    THEME_STORAGE_KEY
  )});localStorage.removeItem(${JSON.stringify(
    CURRENCY_STORAGE_KEY
  )});localStorage.removeItem("mapesim-theme-session");}}catch(e){}`;

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="mapesim-clear-optional-prefs" strategy="beforeInteractive">
          {clearOptionalPrefsScript}
        </Script>
        <CookieConsentProvider
          initialConsent={initialCookieConsent}
          initialPreferencesAllowed={initialPreferencesAllowed}
        >
          <ThemeProvider>
            <CurrencyProvider>
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
