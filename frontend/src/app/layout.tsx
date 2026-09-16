import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-inter",
  display: "swap",
});

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
    <html lang="en" className={inter.variable} style={{ background: "var(--bg-app)", colorScheme: "dark" }}>
      <body style={{ background: "var(--bg-app)", color: "var(--text-primary)", minHeight: "100vh" }}>
        <div className="app-shell">
          <Sidebar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
