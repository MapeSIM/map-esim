import type { NextConfig } from "next";
import { buildNextConfigHeaderSources } from "./app/lib/security/headers";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  // Keep unused Prisma engines / generate junk out of serverless NFT bundles.
  outputFileTracingExcludes: {
    "*": [
      "**/.prisma/client/*.tmp*",
      "**/@prisma/client/runtime/*mysql*",
      "**/@prisma/client/runtime/*sqlite*",
      "**/@prisma/client/runtime/*sqlserver*",
      "**/@prisma/client/runtime/*cockroach*",
      "**/@prisma/engines/schema-engine*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
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
  async redirects() {
    return [
      {
        source: "/plans",
        destination: "/countries",
        permanent: true,
      },
      {
        source: "/esim",
        destination: "/countries",
        permanent: true,
      },
      // /partner/catalog is handled in-app: offerId+country → /partner/buy,
      // otherwise → /countries. Do not 308 here — that strips checkout deep-links.
    ];
  },
};

export default nextConfig;
