import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AuthGuard from "@/components/AuthGuard";
import { EffectsProvider } from "@/context/EffectsContext";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "SmartPharm - Operating System for Physical Pharmacies",
  description: "Vision-first AI + ML Operating System for Indian Physical Pharmacies",
};

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
          <EffectsProvider><AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard></EffectsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
