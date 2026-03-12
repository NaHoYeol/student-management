import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@/generated/prisma"],
};

export default nextConfig;
