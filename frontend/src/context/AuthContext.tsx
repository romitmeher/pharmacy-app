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
      setIsLoading(false);
      return;
    }

    fetchMe(stored)
      .then((u) => {
        setToken(stored);
        setUser(u);
      })
      .catch(() => {
        // Stored token is expired or revoked — clear it silently.
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────

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
