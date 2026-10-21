'use client';

import { useEffect, useRef, useState } from 'react';
import { useEffects } from '@/context/EffectsContext';
import { animationConfig } from '@/lib/animation-config';

/** Dashboard counts only. The exact value remains available to assistive technology. */
export function CountUp({ value }: { value: number }) {
  const { level } = useEffects();
  const played = useRef(false);
  const [progress, setProgress] = useState<{ target: number; current: number } | null>(null);
  useEffect(() => {
    if (level !== 'full' || played.current || document.activeElement?.matches('input, textarea, select')) return;
    played.current = true;
    let frame = 0; let started: number | null = null;
    const finish = () => { cancelAnimationFrame(frame); setProgress(null); };
    const tick = (time: number) => {
      started ??= time;
      const amount = Math.min(1, (time - started) / (animationConfig.duration * 1000));
      setProgress(amount === 1 ? null : { target: value, current: Math.round(value * (1 - (1 - amount) ** 3)) });
      if (amount < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    document.addEventListener('focusin', finish); document.addEventListener('keydown', finish, { once: true });
    return () => { finish(); document.removeEventListener('focusin', finish); document.removeEventListener('keydown', finish); };
  }, [level, value]);
  const shown = level === 'full' && progress?.target === value ? progress.current : value;
  return <><span className="ui-sr-only">{value}</span><span aria-hidden="true">{shown}</span></>;
}
