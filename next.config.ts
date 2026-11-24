import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    // keep server actions payloads sane; product uses route handlers for mutations
    serverActions: { bodySizeLimit: "1mb" },
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
