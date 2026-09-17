"use client";

/**
 * SmartPharm — Route Auth Guard
 *
 * Wraps authenticated content:
 * - Shows a minimal loading screen while the stored token is being validated.
 * - Redirects unauthenticated users to /login (unless they are already there).
 * - Redirects authenticated users away from /login to /.
 */

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Package } from "lucide-react";

// Routes that are accessible without authentication.
const PUBLIC_ROUTES = ["/login", "/login/setup"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && !isPublicRoute) {
      // Unauthenticated user accessing a protected route → send to login.
      router.replace("/login");
      return;
    }

    if (isAuthenticated && isPublicRoute) {
      // Already logged in but sitting on the login page → send home.
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  // ── Loading State ─────────────────────────────────────────────────────────
  // Shown only during the initial mount token validation.
  // Prevents the flash of unauthenticated content.
  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "var(--bg-app)",
          gap: "1rem",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "8px",
            backgroundColor: "#252525",
            border: "1px solid #393939",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--brand-primary)",
          }}
        >
          <Package size={20} />
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          LOADING SMARTPHARM…
        </div>
      </div>
    );
  }

  // ── Blocked State ─────────────────────────────────────────────────────────
  // While the redirect is in-flight, render nothing to avoid flashing content.
  if (!isAuthenticated && !isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
