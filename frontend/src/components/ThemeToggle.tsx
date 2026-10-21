"use client";

import { useEffect, useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

function subscribe(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const snapshot = () => document.documentElement.dataset.theme === 'dark';
const serverSnapshot = () => false;
export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    const restore = () => {
      try { document.documentElement.dataset.theme = localStorage.getItem('smartpharm-theme') === 'dark' ? 'dark' : 'light'; }
      catch { document.documentElement.dataset.theme = 'light'; }
    };
    restore(); window.addEventListener('storage', restore);
    return () => window.removeEventListener('storage', restore);
  }, []);
  return <button type="button" className="theme-toggle" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => {
    const theme = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('smartpharm-theme', theme); } catch { /* The theme still applies for this session. */ }
  }}>{dark ? <Moon size={18} /> : <Sun size={18} />}</button>;
}
