import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: "standalone",
  distDir: process.env.SMARTPHARM_DEMO === "1" ? ".next-demo" : ".next",
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ] },
      { source: "/sw.js", headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-store, max-age=0" },
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self'; connect-src 'self'" },
      ] },
      { source: "/manifest.webmanifest", headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
      ] },
      { source: "/offline.html", headers: [
        { key: "Cache-Control", value: "no-cache" },
        { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
      ] },
    ];
  },
};

export default nextConfig;
