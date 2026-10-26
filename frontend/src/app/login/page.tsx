"use client";
import "./auth.css";
import Image from "next/image";
import Link from "next/link";
import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, ArrowRight, ShieldCheck, Mail, LockKeyhole } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { useAuth } from "@/context/AuthContext";
import { InstallAppButton } from "@/components/PWAProvider";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    startTransition(async () => {
      try {
        await login(email.trim(), password);
        router.replace("/");
      } catch (err: unknown) {
        setError(
          err instanceof Error
            ? err.message
            : "Authentication failed. Check your credentials."
        );
      }
    });
  };

  return (
    <main className="auth-page">
      <div className="auth-frame">
        <section className="auth-story" aria-label="About SmartPharm">
          <Link href="/login" className="auth-brand" aria-label="SmartPharm sign in"><span className="auth-brand-mark"><BrandMark /></span><span>smartpharm<span className="auth-brand-dot">.</span></span></Link>
          <div className="auth-story-copy"><p className="auth-kicker">A LITTLE CLARITY. EVERY DAY.</p><h2><span className="login-line">Good care starts</span><span className="login-line auth-headline-accent">at your counter.</span></h2><p>From the first delivery to the last bill. A calmer way to manage your pharmacy.</p></div>
          <div className="auth-reference auth-reference-photo">
            <Image src="/images/pharmacy-counter.png" alt="Sunlit pharmacy counter with neatly arranged medicine packaging and shelves" fill sizes="(max-width: 900px) 0px, 520px" priority />
            <div className="auth-reference-copy"><span className="auth-reference-number">THE EVERYDAY ESSENTIALS</span><h2>From shelf to sale.</h2><p>One connected workspace.</p></div>
          </div>
          <footer className="auth-story-footer"><span>Made for your everyday practice.</span><span>SmartPharm © {new Date().getFullYear()}</span></footer>
        </section>
        <section className="auth-access" aria-label="Staff sign in">
          <div className="auth-mobile-brand"><BrandMark /><span>smartpharm.</span></div>
          <div className="auth-form-content">
            <div className="auth-portal"><span className="auth-portal-dot" />STAFF WORKSPACE</div>
            <header className="auth-form-heading"><h1>Welcome back.</h1><p>Sign in to keep your pharmacy moving.</p></header>
            {error && <div className="auth-error" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}
            <form onSubmit={handleSubmit} noValidate className="auth-form" aria-busy={isPending}>
              <div className="auth-field"><label htmlFor="login-email">Email address</label><div className="auth-input-shell"><Mail size={18} aria-hidden="true" /><input id="login-email" type="email" placeholder="you@yourpharmacy.com" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} disabled={isPending} className="auth-input" /></div></div>
              <div className="auth-field"><label htmlFor="login-password">Password</label><div className="auth-input-shell"><LockKeyhole size={18} aria-hidden="true" /><input id="login-password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={isPending} className="auth-input auth-password" /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
              <button id="login-submit-btn" type="submit" disabled={isPending} className="auth-submit"><span>{isPending ? "Authenticating…" : "Sign in to workspace"}</span><ArrowRight size={20} aria-hidden="true" /></button>
            </form>
            <div className="auth-setup"><p>Setting up a new pharmacy?</p><Link href="/login/setup">Create your workspace <ArrowRight size={16} aria-hidden="true" /></Link><InstallAppButton /></div>
          </div>
          <footer className="auth-access-footer"><ShieldCheck size={16} aria-hidden="true" /><span>For authorised pharmacy staff only</span></footer>
        </section>
      </div>
    </main>
  );
}
