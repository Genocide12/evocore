import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the tracing root to THIS repo. Without it, Next.js may treat a parent
  // directory (any ancestor with a lockfile) as the workspace root and emit
  // .next/standalone into a nested subfolder, breaking `npm start`.
  outputFileTracingRoot: path.resolve(__dirname),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
