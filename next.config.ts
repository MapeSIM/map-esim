import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flagcdn.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    const privateNoStore = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Pragma", value: "no-cache" },
    ];
    return [
      { source: "/account", headers: privateNoStore },
      { source: "/account/:path*", headers: privateNoStore },
      { source: "/admin", headers: privateNoStore },
      { source: "/admin/:path*", headers: privateNoStore },
    ];
  },
};

export default nextConfig;
