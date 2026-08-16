import type { NextConfig } from "next";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const nextConfig: NextConfig = {
  transpilePackages: ["@spiderman/ui", "@spiderman/types"],
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/engines"],
  webpack: (config, { isServer }) => {
    if (isServer) config.plugins.push(new PrismaPlugin());
    return config;
  },
};

export default nextConfig;
