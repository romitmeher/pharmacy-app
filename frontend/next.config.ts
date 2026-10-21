import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  distDir: process.env.SMARTPHARM_DEMO === "1" ? ".next-demo" : ".next",
};

export default nextConfig;
