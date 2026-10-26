import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SmartPharm — Pharmacy Workspace",
    short_name: "SmartPharm",
    description: "Your pharmacy workspace for stock, batches and billing.",
    lang: "en",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#eef1e8",
    theme_color: "#153e32",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
