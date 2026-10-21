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
        className="authguard-1"
      >
        <div
          className="authguard-2"
        >
          <Package size={20} />
        </div>
        <div
          className="authguard-3"
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
