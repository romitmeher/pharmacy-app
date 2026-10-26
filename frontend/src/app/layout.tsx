import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import { EffectsProvider } from "@/context/EffectsContext";
import AppShell from "@/components/AppShell";
import PWAProvider from "@/components/PWAProvider";

export const metadata: Metadata = {
  title: "SmartPharm - Operating System for Physical Pharmacies",
  description: "Vision-first AI + ML Operating System for Indian Physical Pharmacies",
  applicationName: "SmartPharm",
  other: { "mobile-web-app-capable": "yes" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SmartPharm", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: [{ url: "/icons/favicon.svg", type: "image/svg+xml" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = { themeColor: "#153e32", width: "device-width", initialScale: 1 };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: "var(--bg-app)" }}>
      <head><link rel="preload" href="/fonts/manrope.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head>
      <body style={{ background: "var(--bg-app)", color: "var(--text-primary)", minHeight: "100dvh" }}>
        <AuthProvider>
          <PWAProvider><EffectsProvider><AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard></EffectsProvider></PWAProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
