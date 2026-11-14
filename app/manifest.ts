import type { MetadataRoute } from "next";
import { BRAND_NAME, BRAND_TAGLINE } from "@/app/lib/brand";
import {
  PWA_BACKGROUND_COLOR,
  PWA_THEME_COLOR,
} from "@/app/lib/pwa/pwaIconResponse";

/**
 * Web App Manifest for installable PWA / home-screen experience.
 * Served at /manifest.webmanifest by the App Router.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: "MAP eSIM",
    description: BRAND_TAGLINE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    categories: ["travel", "utilities"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: "/icons/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "My eSIMs",
        short_name: "My eSIMs",
        description: "View and manage your purchased eSIMs",
        url: "/account/orders",
        icons: [{ src: "/icons/icon-192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Check Balance",
        short_name: "Balance",
        description: "Wallet balance and top-ups",
        url: "/account/wallet",
        icons: [{ src: "/icons/icon-192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Support",
        short_name: "Support",
        description: "Get help with your eSIM",
        url: "/support",
        icons: [{ src: "/icons/icon-192", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
