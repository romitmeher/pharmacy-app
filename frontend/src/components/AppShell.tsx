"use client";

/**
 * SmartPharm — App Shell
 *
 * Conditionally renders the Sidebar based on whether the current route is a
 * public page (login, setup). On public pages the full viewport is given to
 * the children so the login page can own its own layout.
 */

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AICopilotDrawer from "@/components/AICopilotDrawer";
import { Menu, X, Package } from "lucide-react";

const PUBLIC_ROUTES = ["/login", "/login/setup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isPublicRoute) {
    // Login / setup pages own their full layout — no shell chrome.
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      {/* Mobile Header Bar */}
      <header className="mobile-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "#252525",
              border: "1px solid #393939",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--brand-primary)",
            }}
          >
            <Package size={14} />
          </div>
          <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
            SmartPharm
          </span>
        </div>
      </header>

      {/* Backdrop for mobile off-canvas drawer */}
      {mobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <main className="main-content">{children}</main>
      <AICopilotDrawer />
    </div>
  );
}
