"use client";

/**
 * SmartPharm — App Shell
 *
 * Conditionally renders the Sidebar based on whether the current route is a
 * public page (login, setup). On public pages the full viewport is given to
 * the children so the login page can own its own layout.
 */

import LegacyDialogAccessibility from "@/components/ui/LegacyDialogAccessibility";
import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CopilotLauncher from "@/components/CopilotLauncher";
import { Menu, X, Package } from "lucide-react";

const PUBLIC_ROUTES = ["/login", "/login/setup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const trigger = document.activeElement as HTMLElement;
    const navigation = document.getElementById('main-navigation');
    navigation?.querySelector<HTMLElement>('a')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (!window.matchMedia('(max-width: 768px)').matches) return;
      if (event.key === 'Escape') { event.preventDefault(); setMobileMenuOpen(false); }
      if (event.key !== 'Tab') return;
      const links = navigation?.querySelectorAll<HTMLElement>('a[href]');
      if (!links?.length) return;
      if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links[links.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === links[links.length - 1]) { event.preventDefault(); links[0].focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (trigger?.isConnected) trigger.focus(); };
  }, [mobileMenuOpen]);

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isPublicRoute) {
    // Login / setup pages own their full layout — no shell chrome.
    return <>{children}</>;
  }

  return (
    <div className="app-shell"><a className="skip-link" href="#main-content">Skip to main content</a>
      {/* Mobile Header Bar */}
      <header className="mobile-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Navigation Menu"
          aria-expanded={mobileMenuOpen} aria-controls="main-navigation"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="appshell-1">
          <div
            className="appshell-2"
          >
            <Package size={14} />
          </div>
          <span className="appshell-3">
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
      <LegacyDialogAccessibility /><main id="main-content" className="main-content">{children}</main>
      <CopilotLauncher />
    </div>
  );
}
