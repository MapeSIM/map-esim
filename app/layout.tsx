import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { CurrencyProvider } from "./components/currency/CurrencyProvider";
import ThemeProvider from "./components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "MAP-eSIM",
  description: "Global eSIM Plans",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <CurrencyProvider>
            <Navbar />
            {children}
            <Footer />
          </CurrencyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
