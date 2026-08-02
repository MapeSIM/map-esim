import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { CurrencyProvider } from "./components/currency/CurrencyProvider";
import ThemeProvider from "./components/theme/ThemeProvider";
import { auth } from "@/auth";
import { navAuthLink } from "@/app/lib/auth/redirects";
import { BRAND_NAME, BRAND_TAGLINE } from "@/app/lib/brand";

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

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <CurrencyProvider>
            <Navbar authHref={authHref} authLabel={authLabel} />
            {children}
            <Footer />
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
