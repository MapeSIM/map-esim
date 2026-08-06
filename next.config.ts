import type { NextConfig } from "next";
import { buildNextConfigHeaderSources } from "./app/lib/security/headers";

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
    return buildNextConfigHeaderSources(process.env);
  },
};

export default nextConfig;
