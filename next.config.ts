import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    // keep server actions payloads sane; product uses route handlers for mutations
    serverActions: { bodySizeLimit: "1mb" },
  },
  poweredByHeader: false,
  reactStrictMode: true,
  // The preview host proxies the dev server from a different origin, so
  // Next.js must be told to allow its dev resources (HMR, RSC payloads,
  // dev assets) from that host. Without this the proxy gets a 403.
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev", "localhost", "127.0.0.1"],
};

export default nextConfig;
