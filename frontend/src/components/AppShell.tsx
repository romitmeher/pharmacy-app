"use client";

/**
 * SmartPharm — App Shell
 *
 * Conditionally renders the Sidebar based on whether the current route is a
 * public page (login, setup). On public pages the full viewport is given to
 * the children so the login page can own its own layout.
 */

import React from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AICopilotDrawer from "@/components/AICopilotDrawer";

const PUBLIC_ROUTES = ["/login", "/login/setup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isPublicRoute) {
    // Login / setup pages own their full layout — no shell chrome.
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">{children}</main>
      <AICopilotDrawer />
    </div>
  );
}
