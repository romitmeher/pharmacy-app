'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { recommendedEffects, type EffectsLevel } from '@/lib/animation-config';

const MotionEffects = dynamic(() => import('@/components/ui/MotionEffects'), { ssr: false });
const EffectsContext = createContext<{ level: EffectsLevel; preference: EffectsLevel | 'auto'; setPreference: (value: EffectsLevel | 'auto') => void }>({ level: 'reduced', preference: 'auto', setPreference: () => {} });
export const useEffects = () => useContext(EffectsContext);

export function EffectsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const key = user ? `smartpharm-effects:${user.store_id}:${user.id}` : 'smartpharm-effects:guest';
  const [preference, setSelected] = useState<EffectsLevel | 'auto'>('auto');
  const [automatic, setAutomatic] = useState<EffectsLevel>('reduced');
  const [systemReduced, setSystemReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const level = systemReduced ? 'off' : preference === 'auto' ? automatic : preference;
  const workingScreen = pathname === '/pos' || pathname === '/inventory';
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const refresh = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(key); } catch { /* Use device preference. */ }
      setSelected(saved === 'full' || saved === 'reduced' || saved === 'off' ? saved : 'auto');
      setAutomatic(recommendedEffects()); setSystemReduced(media.matches);
    };
    queueMicrotask(refresh); media.addEventListener('change', refresh);
    window.addEventListener('storage', refresh);
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); media.removeEventListener('change', refresh); window.removeEventListener('storage', refresh); };
  }, [key]);
  useEffect(() => {
    document.documentElement.dataset.effects = level;
    document.documentElement.dataset.workScreen = String(workingScreen);
  }, [level, workingScreen]);
  useEffect(() => {
    const update = () => { document.documentElement.dataset.inputActive = String(!!document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')); };
    document.addEventListener('focusin', update); document.addEventListener('focusout', update); update();
    return () => { document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); };
  }, []);
  const setPreference = (value: EffectsLevel | 'auto') => {
    setSelected(value);
    try { if (value === 'auto') localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Keep the session preference. */ }
  };
  return <EffectsContext.Provider value={{ level, preference, setPreference }}>{children}{ready && level === 'full' && !workingScreen && <MotionEffects key={pathname} pathname={pathname} />}</EffectsContext.Provider>;
}
