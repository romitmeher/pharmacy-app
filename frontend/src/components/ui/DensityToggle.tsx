'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export function DensityToggle() {
  const { user } = useAuth();
  const [compact, setCompact] = useState(false);
  const key = user ? `smartpharm-density:${user.store_id}:${user.id}` : null;
  useEffect(() => {
    let saved = false;
    try { saved = !!key && localStorage.getItem(key) === 'compact'; } catch { /* Storage may be unavailable. */ }
    document.documentElement.dataset.density = saved ? 'compact' : 'comfortable';
    queueMicrotask(() => setCompact(saved));
  }, [key]);
  return <label className="ui-field">Table density<select className="ui-select" value={compact ? 'compact' : 'comfortable'} onChange={event => {
    const next = event.target.value === 'compact'; setCompact(next);
    document.documentElement.dataset.density = next ? 'compact' : 'comfortable';
    try { if (key) localStorage.setItem(key, next ? 'compact' : 'comfortable'); } catch { /* Keep the preference for this session. */ }
  }}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>;
}
