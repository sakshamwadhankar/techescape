import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@spiderman/ui", "@spiderman/types"],
  output: "standalone",
};

export default nextConfig;
