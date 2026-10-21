"use client";

/**
 * SmartPharm — Authentication Context
 *
 * Provides JWT token management and authenticated user profile to the entire
 * frontend. Persists token to localStorage so sessions survive page refreshes.
 * The localStorage key matches the one already used by api.ts (smartpharm_jwt_token).
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_KEY = "smartpharm_jwt_token";
const PROFILE_KEY = "smartpharm_validated_profile";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  store_id: number;
  email: string;
  username: string;
  full_name: string;
  role: string;
  phone: string | null;
  is_active: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True only during the initial mount check (token validation). */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const persistToken = (t: string) => {
    setToken(t);
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, t);
    }
  };

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PROFILE_KEY);
    }
  }, []);

  /** Fetch /api/auth/me and populate user state. Throws on failure. */
  const fetchMe = async (jwt: string): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) {
      throw new Error("Session expired or invalid.");
    }
    const json = await res.json();
    return json.user as AuthUser;
  };

  // ── On mount: restore session from localStorage ───────────────────────────

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(TOKEN_KEY)
        : null;

    if (!stored) {
      queueMicrotask(() => setIsLoading(false));
      return;
    }

    let cancelled = false;
    const restore = async () => {
      try {
        const u = await fetchMe(stored);
        if (cancelled) return;
        localStorage.setItem(PROFILE_KEY, JSON.stringify({ token: stored, user: u }));
        setToken(stored);
        setUser(u);
      } catch (error) {
        // Only a transport failure permits the last server-validated profile offline.
        // An HTTP rejection or malformed/expired token always ends the local session.
        if (cancelled) return;
        try {
          const payload = JSON.parse(atob(stored.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          const cached = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
          if (error instanceof TypeError && cached?.token === stored && cached.user?.is_active &&
              String(cached.user.id) === String(payload.sub) && cached.user.store_id === payload.store_id &&
              typeof payload.exp === "number" && payload.exp * 1000 > Date.now()) {
            setToken(stored);
            setUser(cached.user);
            return;
          }
        } catch { /* Invalid cached identity is never restored. */ }
        clearSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void restore();
    const onSessionChange = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY && event.newValue !== stored) {
        // Do not erase another tab's new token, but stop displaying the previous identity.
        setToken(null);
        setUser(null);
      }
    };
    window.addEventListener("online", restore);
    window.addEventListener("storage", onSessionChange);
    return () => {
      cancelled = true;
      window.removeEventListener("online", restore);
      window.removeEventListener("storage", onSessionChange);
    };
  }, [token, clearSession]);

  // ── Login ─────────────────────────────────────────────────────────────────


  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      const remaining = payload.exp * 1000 - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) { queueMicrotask(clearSession); return; }
      const timer = window.setTimeout(clearSession, Math.min(remaining, 2147483647));
      return () => window.clearTimeout(timer);
    } catch { queueMicrotask(clearSession); }
  }, [token, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.message || "Invalid email or password.");
    }

    const jwt: string = json.token;
    const profile: AuthUser = json.user;

    localStorage.setItem(PROFILE_KEY, JSON.stringify({ token: jwt, user: profile }));
    persistToken(jwt);
    setUser(profile);
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  // ── Value ─────────────────────────────────────────────────────────────────

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return ctx;
}
