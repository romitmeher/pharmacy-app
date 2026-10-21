'use client';

import { useEffect } from 'react';
import { animate, stagger } from 'framer-motion';
import { animationConfig } from '@/lib/animation-config';

/** Loaded after paint, never mounted on POS or inventory. */
export default function MotionEffects({ pathname }: { pathname: string }) {
  useEffect(() => {
    if (pathname !== '/login' && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    const options = { duration: animationConfig.duration, ease: animationConfig.ease };
    const controls: Array<{ complete: () => void; stop: () => void }> = [];
    const targets = pathname === '/login' ? document.querySelectorAll<HTMLElement>('.login-line') : pathname === '/' ? document.querySelectorAll<HTMLElement>('.dashboard-page .ui-stat') : document.querySelectorAll<HTMLElement>('main > div > .page-header');
    if (targets.length) controls.push(animate(targets, pathname === '/login' ? { clipPath: ['inset(0 0 100% 0)', 'inset(0 0 0 0)'], y: [8, 0] } : { opacity: [0.65, 1], y: [6, 0] }, { ...options, delay: stagger(animationConfig.stagger) }));
    let chartObserver: MutationObserver | undefined;
    if (pathname === '/' || pathname === '/expenses' || pathname === '/audit') {
      const drawChart = () => {
        const bars = document.querySelectorAll<HTMLElement>('.ops-chart-bar');
        if (!bars.length) return;
        chartObserver?.disconnect();
        if (document.activeElement?.matches('input, textarea, select')) return;
        bars.forEach(bar => { const final = bar.style.transform; controls.push(animate(bar, { transform: ['scaleY(0)', final] }, options)); });
      };
      chartObserver = new MutationObserver(drawChart);
      const chart = document.querySelector('.ops-activity');
      if (chart) chartObserver.observe(chart, { childList: true, subtree: true });
      drawChart();
    }
    const finish = () => controls.forEach(control => control.complete());
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement)?.matches('input, textarea, select, [contenteditable="true"]')) finish(); };
    document.addEventListener('focusin', focus); document.addEventListener('keydown', finish, { once: true });
    return () => { chartObserver?.disconnect(); controls.forEach(control => { control.complete(); control.stop(); }); document.removeEventListener('focusin', focus); document.removeEventListener('keydown', finish); };
  }, [pathname]);
  return null;
}
